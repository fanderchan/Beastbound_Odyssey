#!/usr/bin/env python3
"""Audit a Beastbound audio bundle without third-party Python packages."""

from __future__ import annotations

import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import wave


AUDITOR_VERSION = "4.0.0"
REQUIRED_FFMPEG_MAJOR = 8
PEAK_LIMIT_DBFS = -1.0
SILENCE_FLOOR_DBFS = -60.0
DC_ABSOLUTE_LIMIT = 0.001
LOOP_BOUNDARY_DELTA_LIMIT = 0.002
LOOP_WINDOW_RMS_DELTA_DB_LIMIT = 1.0
MUSIC_FINGERPRINT_DISTANCE_LIMIT = 0.12
TEMPORAL_PROFILE_BLOCKS = 16


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _default_bundle_root() -> Path:
    return _repo_root() / "client/godot/assets/audio/beastbound_audio_v2"


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


def _ffmpeg_version(ffmpeg: str) -> dict:
    try:
        result = subprocess.run(
            [ffmpeg, "-version"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError) as error:
        detail = getattr(error, "stderr", "") or str(error)
        raise RuntimeError(f"FFmpeg is unavailable: {detail.strip()}") from error
    first_line = result.stdout.splitlines()[0] if result.stdout else ""
    fields = first_line.split()
    version_token = fields[2] if len(fields) >= 3 else ""
    major_text = version_token.split(".", 1)[0]
    if not major_text.isdigit():
        raise RuntimeError(f"cannot parse FFmpeg version: {first_line}")
    major = int(major_text)
    if major != REQUIRED_FFMPEG_MAJOR:
        raise RuntimeError(
            f"FFmpeg {REQUIRED_FFMPEG_MAJOR} is required, got: {first_line}"
        )
    return {"major": major, "versionLine": first_line}


def _ffprobe_executable(ffmpeg: str) -> str:
    resolved_ffmpeg = shutil.which(ffmpeg)
    if resolved_ffmpeg is None:
        resolved_ffmpeg = str(Path(ffmpeg).expanduser())
    sibling = Path(resolved_ffmpeg).resolve().with_name("ffprobe")
    if sibling.is_file():
        return str(sibling)
    fallback = shutil.which("ffprobe")
    if fallback is None:
        raise RuntimeError("FFprobe from the FFmpeg 8 installation is required")
    return fallback


def _probe_audio_stream(path: Path, *, ffmpeg: str) -> dict:
    command = [
        _ffprobe_executable(ffmpeg),
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        (
            "stream=codec_name,sample_rate,channels,duration,"
            "duration_ts,time_base"
        ),
        "-of",
        "json",
        str(path),
    ]
    try:
        result = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError) as error:
        detail = getattr(error, "stderr", "") or str(error)
        raise RuntimeError(f"FFprobe failed: {detail.strip()}") from error
    parsed = json.loads(result.stdout)
    streams = parsed.get("streams", [])
    if not streams:
        raise ValueError(f"{path}: no audio stream")
    stream = streams[0]
    sample_rate = int(stream.get("sample_rate", 0))
    duration_frames = 0
    duration_ts = stream.get("duration_ts")
    time_base = str(stream.get("time_base", ""))
    if duration_ts not in (None, "N/A") and "/" in time_base:
        numerator_text, denominator_text = time_base.split("/", 1)
        numerator = int(numerator_text)
        denominator = int(denominator_text)
        duration_frames = int(
            round(
                int(duration_ts)
                * numerator
                / denominator
                * sample_rate
            )
        )
    if duration_frames <= 0:
        duration_frames = int(
            round(float(stream.get("duration", 0.0)) * sample_rate)
        )
    if sample_rate <= 0 or duration_frames <= 0:
        raise ValueError(f"{path}: invalid stream duration or sample rate")
    return {
        "channels": int(stream.get("channels", 0)),
        "codecName": str(stream.get("codec_name", "")),
        "durationFrames": duration_frames,
        "sampleRate": sample_rate,
    }


def _probe_audio_codec(path: Path, *, ffmpeg: str) -> str:
    return str(_probe_audio_stream(path, ffmpeg=ffmpeg)["codecName"])


def _decode_ogg(
    path: Path,
    *,
    ffmpeg: str,
    channels: int,
) -> tuple[dict, array]:
    stream_metadata = _probe_audio_stream(path, ffmpeg=ffmpeg)
    handle = tempfile.NamedTemporaryFile(suffix=".decoded.wav", delete=False)
    handle.close()
    decoded_path = Path(handle.name)
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(path),
        "-map",
        "0:a:0",
        "-vn",
        "-map_metadata",
        "-1",
        "-ar",
        "48000",
        "-ac",
        str(channels),
        "-c:a",
        "pcm_s16le",
        str(decoded_path),
    ]
    try:
        subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
        )
        metadata, samples = _load_wav(decoded_path)
        declared_frames = int(stream_metadata["durationFrames"])
        if metadata["frameCount"] < declared_frames:
            raise ValueError(
                f"{path}: decoded stream is shorter than its Ogg granule "
                f"duration ({metadata['frameCount']} < {declared_frames})"
            )
        samples = samples[: declared_frames * channels]
        metadata["frameCount"] = declared_frames
    except (FileNotFoundError, subprocess.CalledProcessError) as error:
        detail = getattr(error, "stderr", "") or str(error)
        raise RuntimeError(f"FFmpeg Ogg decode failed: {detail.strip()}") from error
    finally:
        decoded_path.unlink(missing_ok=True)
    metadata["runtimeCodec"] = "vorbis"
    return metadata, samples


def _decode_three_loop_boundaries(
    path: Path,
    *,
    ffmpeg: str,
    metadata: dict,
) -> dict:
    """Decode four continuous copies and measure all three real boundaries."""

    channels = int(metadata["channels"])
    frames_per_copy = int(metadata["frameCount"])
    frame_width = channels * 2
    boundary_frames = [
        frames_per_copy,
        frames_per_copy * 2,
        frames_per_copy * 3,
    ]
    wanted_frames = {
        frame
        for boundary in boundary_frames
        for frame in (boundary - 1, boundary)
    }
    captured: dict[int, tuple[int, ...]] = {}
    command = [ffmpeg, "-hide_banner", "-loglevel", "error"]
    for _copy_index in range(4):
        command.extend(["-i", str(path)])
    filter_parts = [
        (
            f"[{copy_index}:a:0]"
            f"atrim=end_sample={frames_per_copy},"
            f"asetpts=PTS-STARTPTS[copy{copy_index}]"
        )
        for copy_index in range(4)
    ]
    filter_parts.append(
        "".join(f"[copy{copy_index}]" for copy_index in range(4))
        + "concat=n=4:v=0:a=1[out]"
    )
    command.extend(
        [
        "-filter_complex",
        ";".join(filter_parts),
        "-map",
        "[out]",
        "-vn",
        "-map_metadata",
        "-1",
        "-ar",
        str(metadata["sampleRate"]),
        "-ac",
        str(channels),
        "-f",
        "s16le",
        "pipe:1",
        ]
    )
    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except FileNotFoundError as error:
        raise RuntimeError(f"FFmpeg is unavailable: {error}") from error
    if process.stdout is None or process.stderr is None:
        process.kill()
        raise RuntimeError("FFmpeg loop decode pipes were not created")

    carry = b""
    decoded_frames = 0
    while True:
        chunk = process.stdout.read(1024 * 1024)
        if not chunk:
            break
        payload = carry + chunk
        complete_bytes = len(payload) - (len(payload) % frame_width)
        complete_payload = payload[:complete_bytes]
        complete_frames = complete_bytes // frame_width
        upper_frame = decoded_frames + complete_frames
        for frame in sorted(wanted_frames):
            if decoded_frames <= frame < upper_frame:
                offset = (frame - decoded_frames) * frame_width
                frame_samples = array(
                    "h",
                    complete_payload[offset : offset + frame_width],
                )
                if sys.byteorder != "little":
                    frame_samples.byteswap()
                captured[frame] = tuple(frame_samples)
        decoded_frames = upper_frame
        carry = payload[complete_bytes:]

    stderr = process.stderr.read().decode("utf-8", errors="replace").strip()
    process.stdout.close()
    process.stderr.close()
    return_code = process.wait()
    if return_code != 0:
        raise RuntimeError(f"FFmpeg repeated Ogg decode failed: {stderr}")
    if carry:
        raise RuntimeError("FFmpeg repeated Ogg decode ended on a partial frame")
    minimum_frames = frames_per_copy * 4
    if decoded_frames < minimum_frames:
        raise RuntimeError(
            "FFmpeg repeated Ogg decode was short: "
            f"{decoded_frames} < {minimum_frames} frames"
        )

    deltas: list[float] = []
    for boundary in boundary_frames:
        before = captured.get(boundary - 1)
        after = captured.get(boundary)
        if before is None or after is None:
            raise RuntimeError(
                f"FFmpeg repeated Ogg decode missed boundary {boundary}"
            )
        delta = max(
            abs(after[channel] - before[channel]) / 32768.0
            for channel in range(channels)
        )
        deltas.append(delta)
    return {
        "checkedBoundaryCount": len(deltas),
        "repeatedFrameCount": decoded_frames,
        "threeBoundaryDeltas": [round(value, 8) for value in deltas],
        "threeBoundaryMaxDelta": round(max(deltas, default=0.0), 8),
    }


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


def _signal_metrics(
    metadata: dict,
    samples: array,
    loop: bool,
    *,
    repeated_boundaries: dict | None = None,
) -> dict:
    sample_count = len(samples)
    channels = int(metadata["channels"])
    frame_count = int(metadata["frameCount"])
    peak_integer = 0
    total = 0
    total_squares = 0
    mid_squares = 0.0
    side_squares = 0.0
    for frame in range(frame_count):
        offset = frame * channels
        for channel in range(channels):
            value = int(samples[offset + channel])
            absolute = abs(value)
            if absolute > peak_integer:
                peak_integer = absolute
            total += value
            total_squares += value * value
        if channels == 2:
            left = int(samples[offset])
            right = int(samples[offset + 1])
            mid = (left + right) * 0.5
            side = (left - right) * 0.5
            mid_squares += mid * mid
            side_squares += side * side

    peak = peak_integer / 32768.0
    mean = total / max(1, sample_count) / 32768.0
    rms_integer = math.sqrt(total_squares / max(1, sample_count))
    rms = rms_integer / 32768.0
    zero_crossings = 0
    for channel in range(channels):
        previous = int(samples[channel]) if sample_count > channel else 0
        for index in range(channel + channels, sample_count, channels):
            value = int(samples[index])
            if (previous < 0 <= value) or (previous >= 0 > value):
                zero_crossings += 1
            previous = value

    temporal_profile: list[float] = []
    for block in range(TEMPORAL_PROFILE_BLOCKS):
        first_frame = frame_count * block // TEMPORAL_PROFILE_BLOCKS
        final_frame = frame_count * (block + 1) // TEMPORAL_PROFILE_BLOCKS
        first_sample = first_frame * channels
        final_sample = final_frame * channels
        block_squares = 0
        for index in range(first_sample, final_sample):
            value = int(samples[index])
            block_squares += value * value
        block_rms = math.sqrt(
            block_squares / max(1, final_sample - first_sample)
        )
        temporal_profile.append(
            round(block_rms / max(rms_integer, 1e-9), 6)
        )

    duration = metadata["frameCount"] / metadata["sampleRate"]
    peak_dbfs = _linear_to_db(peak)
    rms_dbfs = _linear_to_db(rms)
    if channels == 2:
        mid_rms = math.sqrt(mid_squares / max(1, frame_count))
        side_rms = math.sqrt(side_squares / max(1, frame_count))
        stereo_side_ratio_db = _linear_to_db(
            side_rms / max(mid_rms, 1e-12)
        )
    else:
        stereo_side_ratio_db = -240.0
    metrics = {
        **metadata,
        "crestFactorDb": round(peak_dbfs - rms_dbfs, 3),
        "dcOffset": round(mean, 8),
        "durationSeconds": round(duration, 6),
        "peakDbfs": round(peak_dbfs, 3),
        "rmsDbfs": round(rms_dbfs, 3),
        "stereoSideRatioDb": round(stereo_side_ratio_db, 3),
        "temporalRmsProfile": temporal_profile,
        "zeroCrossingsPerSecond": round(
            zero_crossings / max(duration * channels, 1e-9),
            3,
        ),
    }
    if loop:
        first_frame = [
            samples[channel] / 32768.0
            for channel in range(min(channels, sample_count))
        ]
        final_frame = [
            samples[sample_count - channels + channel] / 32768.0
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
        first_rms = math.sqrt(
            sum(
                int(samples[index]) * int(samples[index])
                for index in range(window_samples)
            )
            / max(1, window_samples)
        ) / 32768.0
        final_rms = math.sqrt(
            sum(
                int(samples[index]) * int(samples[index])
                for index in range(sample_count - window_samples, sample_count)
            )
            / max(1, window_samples)
        ) / 32768.0
        window_delta_db = abs(
            _linear_to_db(max(first_rms, 1e-12))
            - _linear_to_db(max(final_rms, 1e-12))
        )
        metrics["loop"] = {
            "boundarySampleDelta": round(boundary_delta, 8),
            "windowMilliseconds": 20,
            "windowRmsDeltaDb": round(window_delta_db, 3),
        }
        if repeated_boundaries is not None:
            metrics["loop"].update(repeated_boundaries)
    return metrics


def _music_feature_distance(left: dict, right: dict) -> float:
    """Gain- and duration-independent distance between decoded music signals."""

    left_zcr = float(left["zeroCrossingsPerSecond"])
    right_zcr = float(right["zeroCrossingsPerSecond"])
    zcr_distance = abs(
        math.log2((left_zcr + 1.0) / (right_zcr + 1.0))
    )
    crest_distance = abs(
        float(left["crestFactorDb"]) - float(right["crestFactorDb"])
    ) / 12.0
    side_distance = min(
        abs(
            float(left["stereoSideRatioDb"])
            - float(right["stereoSideRatioDb"])
        ),
        24.0,
    ) / 24.0
    left_profile = left["temporalRmsProfile"]
    right_profile = right["temporalRmsProfile"]
    profile_distance = sum(
        abs(
            math.log2(
                (float(left_value) + 0.01)
                / (float(right_value) + 0.01)
            )
        )
        for left_value, right_value in zip(left_profile, right_profile)
    ) / max(1, min(len(left_profile), len(right_profile)))
    return zcr_distance + crest_distance + side_distance + profile_distance


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
    for asset in [
        *spec.get("music", []),
        *spec.get("ambience", []),
        *spec.get("sfx", []),
    ]:
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
    ffmpeg: str = "ffmpeg",
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
    is_ogg_music_bundle = (
        is_layered_bundle and int(provenance.get("schemaVersion", 1)) >= 3
    )
    live_ffmpeg: dict | None = None
    source_record_ids: set[str] = set()
    if is_layered_bundle:
        try:
            live_ffmpeg = _ffmpeg_version(ffmpeg)
        except RuntimeError as error:
            _failure(failures, "ffmpeg_runtime", str(error))
        if int(generator_info.get("ffmpegMajor", 0)) != 8:
            _failure(
                failures,
                "ffmpeg_version",
                f"expected FFmpeg 8, got {generator_info.get('ffmpegVersion')}",
            )
        if is_ogg_music_bundle:
            if generator_info.get("vorbisEncoder") not in {
                "libvorbis",
                "vorbis",
            }:
                _failure(
                    failures,
                    "vorbis_encoder",
                    (
                        "generator must record the actual Vorbis encoder, got "
                        f"{generator_info.get('vorbisEncoder')!r}"
                    ),
                )
            if int(generator_info.get("vorbisQuality", -1)) != 5:
                _failure(
                    failures,
                    "vorbis_quality",
                    (
                        "expected Vorbis quality 5, got "
                        f"{generator_info.get('vorbisQuality')!r}"
                    ),
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
    ambience_assets = spec.get("ambience", [])
    has_ambience = isinstance(ambience_assets, list) and bool(ambience_assets)
    expected_ambience_contexts = {"town", "wilderness", "cave"}
    present_ambience_contexts = set(catalog.get("ambienceContexts", {}))
    if has_ambience and present_ambience_contexts != expected_ambience_contexts:
        _failure(
            failures,
            "ambience_context_coverage",
            (
                f"expected {sorted(expected_ambience_contexts)}, got "
                f"{sorted(present_ambience_contexts)}"
            ),
        )
    if not has_ambience and present_ambience_contexts:
        _failure(
            failures,
            "unexpected_ambience_contexts",
            f"bundle has no ambience assets: {sorted(present_ambience_contexts)}",
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
        for asset in [
            *spec.get("music", []),
            *spec.get("ambience", []),
            *spec.get("sfx", []),
        ]
    }
    expected_runtime_paths: set[Path] = set()
    loop_features_by_role: dict[str, dict[str, dict]] = {
        "music": {},
        "ambience": {},
    }
    peak_limit = 10.0 ** (PEAK_LIMIT_DBFS / 20.0)

    for cue_id, cue in sorted(catalog.get("cues", {}).items()):
        role = str(cue.get("role", ""))
        if role == "music" or cue_id.startswith("music."):
            expected_bus = "Music"
        elif role == "ambience" or cue_id.startswith("ambience."):
            expected_bus = "Ambience"
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
        expected_suffix = (
            ".ogg"
            if role in {"music", "ambience"} and is_ogg_music_bundle
            else ".wav"
        )
        if absolute_path.suffix.lower() != expected_suffix:
            _failure(
                failures,
                "runtime_format",
                f"{cue_id}: expected {expected_suffix}, got {absolute_path.suffix}",
            )
        try:
            if absolute_path.suffix.lower() == ".ogg":
                codec_name = _probe_audio_codec(absolute_path, ffmpeg=ffmpeg)
                if codec_name != "vorbis":
                    raise ValueError(
                        f"{absolute_path}: expected Vorbis, got {codec_name}"
                    )
                metadata, samples = _decode_ogg(
                    absolute_path,
                    ffmpeg=ffmpeg,
                    channels=2,
                )
                repeated_boundaries = (
                    _decode_three_loop_boundaries(
                        absolute_path,
                        ffmpeg=ffmpeg,
                        metadata=metadata,
                    )
                    if bool(cue["loop"])
                    else None
                )
            else:
                metadata, samples = _load_wav(absolute_path)
                metadata["runtimeCodec"] = "pcm_s16le"
                repeated_boundaries = None
        except (RuntimeError, ValueError, wave.Error) as error:
            _failure(failures, "invalid_runtime_audio", str(error))
            continue
        metrics = _signal_metrics(
            metadata,
            samples,
            bool(cue["loop"]),
            repeated_boundaries=repeated_boundaries,
        )
        metrics["sha256"] = _sha256_file(absolute_path)
        asset_metrics[cue_id] = metrics

        expected_channels = 2 if role in {"music", "ambience"} else 1
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
        if (
            absolute_path.suffix.lower() == ".wav"
            and metadata["compression"] != "NONE"
        ):
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
            if absolute_path.suffix.lower() == ".ogg":
                if loop_metrics.get("checkedBoundaryCount") != 3:
                    _failure(
                        failures,
                        "loop_boundary_count",
                        (
                            f"{cue_id}: expected 3 actual boundaries, got "
                            f"{loop_metrics.get('checkedBoundaryCount')}"
                        ),
                    )
                if (
                    float(loop_metrics.get("threeBoundaryMaxDelta", 1.0))
                    > LOOP_BOUNDARY_DELTA_LIMIT
                ):
                    _failure(
                        failures,
                        "loop_three_boundaries",
                        (
                            f"{cue_id}: repeated max sample delta "
                            f"{loop_metrics.get('threeBoundaryMaxDelta')}"
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
            if role in loop_features_by_role:
                loop_features_by_role[role][cue_id] = metrics

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
                if role in {"music", "ambience"} and is_ogg_music_bundle:
                    required_music_fields = (
                        "filename",
                        "projectCopy",
                        "trimStartSeconds",
                        "trimEndSeconds",
                        "loopCrossfadeSeconds",
                        "masterGainDb",
                    )
                    missing_music_fields = [
                        field
                        for field in required_music_fields
                        if field not in source_asset
                    ]
                    if missing_music_fields:
                        _failure(
                            failures,
                            "long_form_spec_fields",
                            (
                                f"{cue_id}: missing "
                                + ", ".join(missing_music_fields)
                            ),
                        )
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
        for suffix in ("*.wav", "*.ogg")
        for path in (bundle_root / "runtime").rglob(suffix)
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

    for role, role_features in loop_features_by_role.items():
        role_cues = sorted(role_features)
        for left_index, left_id in enumerate(role_cues):
            for right_id in role_cues[left_index + 1 :]:
                left = role_features[left_id]
                right = role_features[right_id]
                feature_distance = _music_feature_distance(left, right)
                if feature_distance < MUSIC_FINGERPRINT_DISTANCE_LIMIT:
                    _failure(
                        failures,
                        f"{role}_distinguishability",
                        (
                            f"{left_id} and {right_id} duration-independent "
                            f"feature distance {feature_distance:.3f}"
                        ),
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
    ambience_context_cues = set(
        catalog.get("ambienceContexts", {}).values()
    )
    if has_ambience and ambience_context_cues != {
        "ambience.town",
        "ambience.wilderness",
        "ambience.cave",
    }:
        _failure(
            failures,
            "ambience_context_binding",
            (
                "unexpected ambience context cue set: "
                f"{sorted(ambience_context_cues)}"
            ),
        )

    report = {
        "assetCount": len(asset_metrics),
        "assets": asset_metrics,
        "auditor": {
            "ffmpeg": live_ffmpeg,
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
            "musicFingerprintDistanceLimit": (
                MUSIC_FINGERPRINT_DISTANCE_LIMIT
            ),
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
        "--ffmpeg",
        default="ffmpeg",
        help="FFmpeg 8 executable",
    )
    parser.add_argument(
        "--no-write-report",
        action="store_true",
        help="audit without replacing audit-report.json",
    )
    args = parser.parse_args()
    report = audit_bundle(
        args.bundle,
        write_report=not args.no_write_report,
        ffmpeg=args.ffmpeg,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
