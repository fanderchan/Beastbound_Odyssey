#!/usr/bin/env python3
"""Build a provenance-locked Beastbound audio bundle with FFmpeg 8.

The source specification lives at ``<bundle>/source/spec.json``. Music is
trimmed from one declared source, circularly crossfaded, and emitted as
48 kHz stereo Ogg Vorbis. Short effects are built from one or more declared
layers, mixed without automatic normalization, edge-faded, and emitted as
48 kHz mono PCM16 WAV.
"""

from __future__ import annotations

import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import platform
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import wave


GENERATOR_VERSION = "3.0.0"
REQUIRED_FFMPEG_MAJOR = 8
SAMPLE_RATE = 48000
VORBIS_QUALITY = 5
LOOP_ROTATION_SEARCH_SECONDS = 60.0
LOOP_ROTATION_WINDOW_SECONDS = 0.020
LOOP_ROTATION_DELTA_TARGET = 0.00025
LOOP_ROTATION_WINDOW_DB_TARGET = 0.5


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _default_spec_path() -> Path:
    return (
        _repo_root()
        / "client/godot/assets/audio/beastbound_audio_v2/source/spec.json"
    )


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


def _json_fragment_hash(value: dict) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return _sha256_bytes(payload)


def _confined_path(base: Path, relative_value: str, *, field: str) -> Path:
    relative = Path(str(relative_value))
    if relative.is_absolute():
        raise ValueError(f"{field} must be relative: {relative_value}")
    resolved_base = base.resolve()
    resolved = (resolved_base / relative).resolve()
    if not resolved.is_relative_to(resolved_base):
        raise ValueError(f"{field} escapes {resolved_base}: {relative_value}")
    return resolved


def _ffmpeg_version(ffmpeg: str) -> dict:
    result = subprocess.run(
        [ffmpeg, "-version"],
        check=True,
        capture_output=True,
        text=True,
    )
    first_line = result.stdout.splitlines()[0].strip()
    match = re.search(r"\bffmpeg version\s+(\d+)(?:\.([0-9]+))?", first_line)
    if match is None:
        raise RuntimeError(f"cannot parse FFmpeg version: {first_line}")
    major = int(match.group(1))
    if major != REQUIRED_FFMPEG_MAJOR:
        raise RuntimeError(
            f"FFmpeg {REQUIRED_FFMPEG_MAJOR}.x is required, got: {first_line}"
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


def _probe_audio(ffmpeg: str, path: Path) -> dict:
    command = [
        _ffprobe_executable(ffmpeg),
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=codec_name,sample_rate,channels,duration:format=duration",
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
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or error.stdout or str(error)).strip()
        raise RuntimeError(f"FFprobe failed: {detail}") from error
    parsed = json.loads(result.stdout)
    streams = parsed.get("streams", [])
    if not streams:
        raise ValueError(f"{path}: no audio stream")
    stream = streams[0]
    duration_value = stream.get("duration")
    if duration_value in (None, "N/A"):
        duration_value = parsed.get("format", {}).get("duration")
    duration = _safe_number(
        duration_value,
        field=f"{path.name}.duration",
        minimum=0.001,
    )
    return {
        "channels": int(stream.get("channels", 0)),
        "codecName": str(stream.get("codec_name", "")),
        "durationSeconds": duration,
        "sampleRate": int(stream.get("sample_rate", 0)),
    }


def _vorbis_encoder(ffmpeg: str) -> dict:
    result = subprocess.run(
        [ffmpeg, "-hide_banner", "-encoders"],
        check=True,
        capture_output=True,
        text=True,
    )
    available: set[str] = set()
    for line in result.stdout.splitlines():
        fields = line.split()
        if len(fields) >= 2 and fields[0].startswith("A"):
            available.add(fields[1])
    if "libvorbis" in available:
        return {
            "name": "libvorbis",
            "strictExperimental": False,
        }
    if "vorbis" in available:
        return {
            "name": "vorbis",
            "strictExperimental": True,
        }
    raise RuntimeError("FFmpeg 8 has no Vorbis audio encoder")


def _run_ffmpeg(command: list[str]) -> None:
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or error.stdout or str(error)).strip()
        raise RuntimeError(f"FFmpeg failed: {detail}") from error


def _wav_metadata(path: Path) -> dict:
    with wave.open(str(path), "rb") as handle:
        if handle.getsampwidth() != 2 or handle.getcomptype() != "NONE":
            raise ValueError(f"{path}: expected uncompressed PCM16 WAV")
        return {
            "channels": handle.getnchannels(),
            "durationFrames": handle.getnframes(),
            "durationSeconds": round(
                handle.getnframes() / max(1, handle.getframerate()),
                6,
            ),
            "sampleRate": handle.getframerate(),
        }


def _stable_loop_rotation(
    path: Path,
    *,
    preferred_rotation_seconds: float | None = None,
) -> dict:
    """Choose a deterministic natural cut without adding an edge fade."""

    with wave.open(str(path), "rb") as handle:
        channels = handle.getnchannels()
        sample_rate = handle.getframerate()
        frame_count = handle.getnframes()
        if (
            channels != 2
            or sample_rate != SAMPLE_RATE
            or handle.getsampwidth() != 2
            or handle.getcomptype() != "NONE"
        ):
            raise ValueError(f"{path}: loop rotation requires 48 kHz stereo PCM16")
        window_frames = int(
            round(LOOP_ROTATION_WINDOW_SECONDS * sample_rate)
        )
        if preferred_rotation_seconds is not None:
            cut_frame = int(round(preferred_rotation_seconds * sample_rate))
            if cut_frame < window_frames or cut_frame > frame_count - window_frames:
                raise ValueError(
                    f"{path}: reviewed loopRotationSeconds "
                    f"{preferred_rotation_seconds:.6f} is too close to an edge"
                )
            handle.setpos(cut_frame - window_frames)
            payload = handle.readframes(window_frames * 2)
            samples = array("h")
            samples.frombytes(payload)
            if sys.byteorder != "little":
                samples.byteswap()
            expected_samples = window_frames * 2 * channels
            if len(samples) != expected_samples:
                raise ValueError(f"{path}: reviewed loop rotation window is short")
            before_offset = (window_frames - 1) * channels
            after_offset = window_frames * channels
            boundary_delta = max(
                abs(
                    int(samples[after_offset + channel])
                    - int(samples[before_offset + channel])
                )
                / 32768.0
                for channel in range(channels)
            )
            before_energy = sum(
                int(value) * int(value)
                for value in samples[: window_frames * channels]
            )
            after_energy = sum(
                int(value) * int(value)
                for value in samples[window_frames * channels :]
            )
            before_rms = math.sqrt(
                before_energy / max(1, window_frames * channels)
            )
            after_rms = math.sqrt(
                after_energy / max(1, window_frames * channels)
            )
            if before_rms <= 1e-9 or after_rms <= 1e-9:
                raise ValueError(f"{path}: reviewed loop rotation is silent")
            window_delta_db = abs(20.0 * math.log10(before_rms / after_rms))
            if (
                boundary_delta > LOOP_ROTATION_DELTA_TARGET
                or window_delta_db > LOOP_ROTATION_WINDOW_DB_TARGET
            ):
                raise ValueError(
                    f"{path}: reviewed loop rotation misses the pre-encode "
                    f"gate (delta={boundary_delta:.8f}, "
                    f"window={window_delta_db:.6f} dB)"
                )
            local_rms = math.sqrt(
                (before_energy + after_energy)
                / max(1, window_frames * channels * 2)
            )
            return {
                "preEncodeBoundarySampleDelta": round(boundary_delta, 8),
                "preEncodeLocalRmsDbfs": round(
                    20.0 * math.log10(local_rms / 32768.0),
                    3,
                ),
                "preEncodeWindowRmsDeltaDb": round(window_delta_db, 6),
                "rotationFrames": cut_frame,
                "rotationSeconds": round(cut_frame / SAMPLE_RATE, 6),
                "searchSeconds": 0.0,
                "searchStepFrames": 0,
                "selectionMode": "reviewed_spec_override",
                "windowMilliseconds": int(
                    round(LOOP_ROTATION_WINDOW_SECONDS * 1000.0)
                ),
            }
        first_candidate = window_frames
        final_candidate = min(
            frame_count - window_frames,
            int(round(LOOP_ROTATION_SEARCH_SECONDS * sample_rate)),
        )
        if final_candidate <= first_candidate:
            raise ValueError(f"{path}: loop is too short for rotation search")
        payload = handle.readframes(final_candidate + window_frames)

    samples = array("h")
    samples.frombytes(payload)
    if sys.byteorder != "little":
        samples.byteswap()
    frame_energy_prefix = [0]
    for frame in range(final_candidate + window_frames):
        offset = frame * channels
        energy = 0
        for channel in range(channels):
            value = int(samples[offset + channel])
            energy += value * value
        frame_energy_prefix.append(frame_energy_prefix[-1] + energy)

    best: tuple[float, float, int, float, float] | None = None
    for cut_frame in range(first_candidate, final_candidate):
        before_offset = (cut_frame - 1) * channels
        after_offset = cut_frame * channels
        boundary_delta = max(
            abs(
                int(samples[after_offset + channel])
                - int(samples[before_offset + channel])
            )
            / 32768.0
            for channel in range(channels)
        )
        if boundary_delta > LOOP_ROTATION_DELTA_TARGET:
            continue
        before_energy = (
            frame_energy_prefix[cut_frame]
            - frame_energy_prefix[cut_frame - window_frames]
        )
        after_energy = (
            frame_energy_prefix[cut_frame + window_frames]
            - frame_energy_prefix[cut_frame]
        )
        before_rms = math.sqrt(
            before_energy / max(1, window_frames * channels)
        )
        after_rms = math.sqrt(
            after_energy / max(1, window_frames * channels)
        )
        if before_rms <= 1e-9 or after_rms <= 1e-9:
            continue
        window_delta_db = abs(
            20.0 * math.log10(before_rms / after_rms)
        )
        if window_delta_db > LOOP_ROTATION_WINDOW_DB_TARGET:
            continue
        local_rms = math.sqrt(
            (before_energy + after_energy)
            / max(1, window_frames * channels * 2)
        )
        score = (
            boundary_delta / LOOP_ROTATION_DELTA_TARGET
            + window_delta_db / LOOP_ROTATION_WINDOW_DB_TARGET
            + cut_frame / max(1, final_candidate) * 0.05
        )
        candidate = (
            local_rms,
            score,
            cut_frame,
            boundary_delta,
            window_delta_db,
        )
        if best is None or candidate < best:
            best = candidate
    if best is None:
        raise ValueError(
            f"{path}: no stable natural cut within "
            f"{LOOP_ROTATION_SEARCH_SECONDS:.3f}s; adjust the reviewed trim "
            "or loop crossfade"
        )
    return {
        "preEncodeBoundarySampleDelta": round(best[3], 8),
        "preEncodeLocalRmsDbfs": round(
            20.0 * math.log10(best[0] / 32768.0),
            3,
        ),
        "preEncodeWindowRmsDeltaDb": round(best[4], 6),
        "rotationFrames": best[2],
        "rotationSeconds": round(best[2] / SAMPLE_RATE, 6),
        "searchSeconds": LOOP_ROTATION_SEARCH_SECONDS,
        "searchStepFrames": 1,
        "selectionMode": "deterministic_search",
        "windowMilliseconds": int(
            round(LOOP_ROTATION_WINDOW_SECONDS * 1000.0)
        ),
    }


def _decoded_metadata(
    path: Path,
    *,
    ffmpeg: str,
    channels: int,
) -> dict:
    encoded_metadata = _probe_audio(ffmpeg, path)
    temporary = _temporary_file(path, suffix=".decoded.wav")
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-fflags",
        "+bitexact",
        "-i",
        str(path),
        "-map",
        "0:a:0",
        "-vn",
        "-map_metadata",
        "-1",
        "-ar",
        str(SAMPLE_RATE),
        "-ac",
        str(channels),
        "-c:a",
        "pcm_s16le",
        "-threads",
        "1",
        "-flags:a",
        "+bitexact",
        str(temporary),
    ]
    try:
        _run_ffmpeg(command)
        metadata = _wav_metadata(temporary)
        declared_frames = int(
            round(encoded_metadata["durationSeconds"] * SAMPLE_RATE)
        )
        if metadata["durationFrames"] < declared_frames:
            raise ValueError(
                f"{path}: decoded stream is shorter than its Ogg granule "
                f"duration ({metadata['durationFrames']} < {declared_frames})"
            )
        metadata["durationFrames"] = declared_frames
        metadata["durationSeconds"] = round(
            declared_frames / SAMPLE_RATE,
            6,
        )
        return metadata
    finally:
        temporary.unlink(missing_ok=True)


def _source_registry(
    spec: dict,
    *,
    bundle_root: Path,
    project_root: Path,
) -> tuple[dict[str, dict], list[dict]]:
    raw_sources = spec.get("sources", [])
    if isinstance(raw_sources, dict):
        raw_sources = [
            {"sourceId": source_id, **source}
            for source_id, source in raw_sources.items()
        ]
    if not isinstance(raw_sources, list) or not raw_sources:
        raise ValueError("spec.sources must contain at least one source record")

    registry: dict[str, dict] = {}
    provenance_records: list[dict] = []
    required_text = ("sourceType", "author", "licenseName", "licenseUrl")
    for source in raw_sources:
        source_id = str(source.get("sourceId", "")).strip()
        if not source_id or source_id in registry:
            raise ValueError(f"invalid or duplicate sourceId: {source_id!r}")
        for field in required_text:
            if not str(source.get(field, "")).strip():
                raise ValueError(f"{source_id}: missing {field}")
        license_url = str(source["licenseUrl"]).strip()
        if "://" not in license_url:
            raise ValueError(f"{source_id}: licenseUrl must be an absolute URI")

        has_bundle_source = bool(str(source.get("sourcePath", "")).strip())
        has_project_source = bool(str(source.get("projectPath", "")).strip())
        if has_bundle_source == has_project_source:
            raise ValueError(
                f"{source_id}: declare exactly one sourcePath or projectPath"
            )
        if has_bundle_source:
            logical_path = str(source["sourcePath"])
            resolved_path = _confined_path(
                bundle_root,
                logical_path,
                field=f"{source_id}.sourcePath",
            )
            path_kind = "bundle"
            path_field = "sourcePath"
        else:
            logical_path = str(source["projectPath"])
            resolved_path = _confined_path(
                project_root,
                logical_path,
                field=f"{source_id}.projectPath",
            )
            path_kind = "project"
            path_field = "projectPath"
        if not resolved_path.is_file():
            raise FileNotFoundError(f"{source_id}: missing source {resolved_path}")

        expected_hash = str(source.get("expectedSha256", "")).lower()
        if re.fullmatch(r"[0-9a-f]{64}", expected_hash) is None:
            raise ValueError(f"{source_id}: expectedSha256 must be SHA-256 hex")
        actual_hash = _sha256_file(resolved_path)
        if actual_hash != expected_hash:
            raise ValueError(
                f"{source_id}: source hash differs; "
                f"expected {expected_hash}, got {actual_hash}"
            )

        runtime_record = {
            **source,
            "_resolvedPath": resolved_path,
            "_pathKind": path_kind,
        }
        registry[source_id] = runtime_record
        provenance_record = {
            "author": str(source["author"]),
            "expectedSha256": expected_hash,
            "licenseName": str(source["licenseName"]),
            "licenseUrl": license_url,
            "pathKind": path_kind,
            path_field: logical_path,
            "sourceId": source_id,
            "sourceSha256": actual_hash,
            "sourceType": str(source["sourceType"]),
        }
        source_page_url = str(source.get("sourcePageUrl", "")).strip()
        if source_page_url:
            if "://" not in source_page_url:
                raise ValueError(
                    f"{source_id}: sourcePageUrl must be an absolute URI"
                )
            provenance_record["sourcePageUrl"] = source_page_url
        provenance_records.append(provenance_record)
    return registry, sorted(
        provenance_records,
        key=lambda item: item["sourceId"],
    )


def _source_ref(value: object, *, field: str) -> dict:
    if isinstance(value, str):
        return {"sourceId": value}
    if not isinstance(value, dict):
        raise ValueError(f"{field} must be a sourceId or object")
    return dict(value)


def _asset_layers(asset: dict) -> list[dict]:
    project_copy = asset.get("projectCopy")
    layers = asset.get("layers")
    if project_copy is not None and layers is not None:
        raise ValueError(
            f"{asset.get('assetId')}: use projectCopy or layers, not both"
        )
    if project_copy is not None:
        return [_source_ref(project_copy, field="projectCopy")]
    if not isinstance(layers, list) or not layers:
        raise ValueError(
            f"{asset.get('assetId')}: layers must contain one or more entries"
        )
    return [
        _source_ref(layer, field=f"layers[{index}]")
        for index, layer in enumerate(layers)
    ]


def _safe_number(
    value: object,
    *,
    field: str,
    minimum: float | None = None,
    maximum: float | None = None,
) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{field} must be numeric") from error
    if minimum is not None and number < minimum:
        raise ValueError(f"{field} must be >= {minimum}")
    if maximum is not None and number > maximum:
        raise ValueError(f"{field} must be <= {maximum}")
    return number


def _layer_filter(
    layer: dict,
    index: int,
    *,
    output_duration: float | None = None,
) -> str:
    filters: list[str] = []
    trim_parts: list[str] = []
    if "trimStartSeconds" in layer:
        trim_parts.append(
            "start="
            + f"{_safe_number(layer['trimStartSeconds'], field='trimStartSeconds', minimum=0):.6f}"
        )
    if "trimEndSeconds" in layer:
        trim_parts.append(
            "end="
            + f"{_safe_number(layer['trimEndSeconds'], field='trimEndSeconds', minimum=0):.6f}"
        )
    if trim_parts:
        filters.append("atrim=" + ":".join(trim_parts))
    filters.extend(
        [
            "asetpts=PTS-STARTPTS",
            f"aresample={SAMPLE_RATE}:async=0",
            "aformat=sample_fmts=fltp:channel_layouts=mono",
        ]
    )

    pitch_scale = _safe_number(
        layer.get("pitchScale", 1.0),
        field="pitchScale",
        minimum=0.25,
        maximum=4.0,
    )
    if abs(pitch_scale - 1.0) > 1e-9:
        filters.extend(
            [
                f"asetrate={SAMPLE_RATE}*{pitch_scale:.8f}",
                f"aresample={SAMPLE_RATE}:async=0",
            ]
        )
    if "highpassHz" in layer:
        highpass = _safe_number(
            layer["highpassHz"],
            field="highpassHz",
            minimum=1.0,
            maximum=SAMPLE_RATE / 2.0 - 1.0,
        )
        filters.append(f"highpass=f={highpass:.3f}")
    if "lowpassHz" in layer:
        lowpass = _safe_number(
            layer["lowpassHz"],
            field="lowpassHz",
            minimum=1.0,
            maximum=SAMPLE_RATE / 2.0 - 1.0,
        )
        filters.append(f"lowpass=f={lowpass:.3f}")
    if (
        "highpassHz" in layer
        and "lowpassHz" in layer
        and float(layer["highpassHz"]) >= float(layer["lowpassHz"])
    ):
        raise ValueError("highpassHz must be lower than lowpassHz")

    gain_db = _safe_number(
        layer.get("gainDb", 0.0),
        field="gainDb",
        minimum=-96.0,
        maximum=24.0,
    )
    if abs(gain_db) > 1e-9:
        filters.append(f"volume={gain_db:.3f}dB")
    delay_ms = int(
        round(
            _safe_number(
                layer.get("delayMs", 0),
                field="delayMs",
                minimum=0,
                maximum=60000,
            )
        )
    )
    if delay_ms:
        filters.append(f"adelay={delay_ms}:all=1")
    if output_duration is not None:
        # Keep every amix input on the same deterministic frame cadence.
        # p=0 fixes frame scheduling without padding a short layer past its
        # natural EOF. This keeps repeated builds bit-exact while preserving
        # the previously reviewed SFX sample count and waveform.
        filters.append("asetnsamples=n=1024:p=0")
    return f"[{index}:a:0]" + ",".join(filters) + f"[layer{index}]"


def _temporary_file(target: Path, *, suffix: str) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        prefix=f".{target.stem}.",
        suffix=suffix,
        dir=target.parent,
        delete=False,
    )
    handle.close()
    return Path(handle.name)


def _temporary_wav(target: Path) -> Path:
    return _temporary_file(target, suffix=".wav")


def _logical_command(
    command: list[str],
    *,
    actual_inputs: list[Path],
    logical_inputs: list[str],
    actual_output: Path,
    logical_output: str,
) -> str:
    replacements = {
        str(actual): logical
        for actual, logical in zip(actual_inputs, logical_inputs, strict=True)
    }
    replacements[str(actual_output)] = logical_output
    normalized = [replacements.get(token, token) for token in command]
    normalized[0] = "ffmpeg"
    return shlex.join(normalized)


def _render_music(
    asset: dict,
    source: dict,
    target: Path,
    *,
    ffmpeg: str,
    vorbis_encoder: dict,
) -> tuple[dict, str, dict]:
    source_path = Path(source["_resolvedPath"])
    source_metadata = _probe_audio(ffmpeg, source_path)
    trim_start = _safe_number(
        asset.get("trimStartSeconds", 0.0),
        field=f"{asset['assetId']}.trimStartSeconds",
        minimum=0.0,
    )
    trim_end = _safe_number(
        asset.get("trimEndSeconds", source_metadata["durationSeconds"]),
        field=f"{asset['assetId']}.trimEndSeconds",
        minimum=0.0,
    )
    if trim_end <= trim_start:
        raise ValueError(
            f"{asset['assetId']}: trimEndSeconds must be greater than "
            "trimStartSeconds"
        )
    if trim_end > source_metadata["durationSeconds"] + 0.050:
        raise ValueError(
            f"{asset['assetId']}: trimEndSeconds {trim_end:.6f} exceeds "
            f"source duration {source_metadata['durationSeconds']:.6f}"
        )
    trimmed_duration = trim_end - trim_start
    requested_crossfade = _safe_number(
        asset.get("loopCrossfadeSeconds", 0.0),
        field=f"{asset['assetId']}.loopCrossfadeSeconds",
        minimum=0.0,
        maximum=30.0,
    )
    should_loop = bool(asset.get("loop", False))
    if should_loop and requested_crossfade <= 0.0:
        raise ValueError(
            f"{asset['assetId']}: looping Ogg music requires a positive "
            "loopCrossfadeSeconds"
        )
    if requested_crossfade * 2.0 >= trimmed_duration:
        raise ValueError(
            f"{asset['assetId']}: loopCrossfadeSeconds must be less than "
            "half the trimmed duration"
        )
    if not should_loop and requested_crossfade > 0.0:
        raise ValueError(
            f"{asset['assetId']}: non-looping music cannot declare "
            "loopCrossfadeSeconds"
        )
    crossfade = requested_crossfade
    crossfade_alignment_frames = 0
    if should_loop:
        trimmed_frames = int(round(trimmed_duration * SAMPLE_RATE))
        requested_crossfade_frames = int(
            round(requested_crossfade * SAMPLE_RATE)
        )
        requested_output_frames = trimmed_frames - requested_crossfade_frames
        aligned_output_frames = requested_output_frames // 64 * 64
        if aligned_output_frames <= 0:
            raise ValueError(f"{asset['assetId']}: aligned loop is empty")
        applied_crossfade_frames = trimmed_frames - aligned_output_frames
        crossfade_alignment_frames = (
            applied_crossfade_frames - requested_crossfade_frames
        )
        crossfade = applied_crossfade_frames / SAMPLE_RATE
    master_gain = _safe_number(
        asset.get("masterGainDb", 0.0),
        field=f"{asset['assetId']}.masterGainDb",
        minimum=-96.0,
        maximum=24.0,
    )
    highpass_hz = _safe_number(
        asset.get("highpassHz", 0.0),
        field=f"{asset['assetId']}.highpassHz",
        minimum=0.0,
        maximum=100.0,
    )
    preferred_rotation_seconds: float | None = None
    if "loopRotationSeconds" in asset:
        if not should_loop:
            raise ValueError(
                f"{asset['assetId']}: non-looping music cannot declare "
                "loopRotationSeconds"
            )
        preferred_rotation_seconds = _safe_number(
            asset["loopRotationSeconds"],
            field=f"{asset['assetId']}.loopRotationSeconds",
            minimum=LOOP_ROTATION_WINDOW_SECONDS,
        )

    input_filters = [
        f"atrim=start={trim_start:.6f}:end={trim_end:.6f}",
        "asetpts=PTS-STARTPTS",
        f"aresample={SAMPLE_RATE}:async=0",
        (
            f"aformat=sample_fmts=fltp:sample_rates={SAMPLE_RATE}:"
            "channel_layouts=stereo"
        ),
    ]
    if highpass_hz > 0.0:
        input_filters.append(f"highpass=f={highpass_hz:.3f}")
    if abs(master_gain) > 1e-9:
        input_filters.append(f"volume={master_gain:.3f}dB")
    filter_parts: list[str] = []
    if should_loop:
        input_filters.append("asplit=3")
        filter_parts.extend(
            [
                "[0:a:0]"
                + ",".join(input_filters)
                + "[body_source][tail_source][head_source]",
                (
                    "[body_source]"
                    f"atrim=start={crossfade:.6f}:"
                    f"end={trimmed_duration - crossfade:.6f},"
                    "asetpts=PTS-STARTPTS[body]"
                ),
                (
                    "[tail_source]"
                    f"atrim=start={trimmed_duration - crossfade:.6f}:"
                    f"end={trimmed_duration:.6f},"
                    "asetpts=PTS-STARTPTS,"
                    f"afade=t=out:st=0:d={crossfade:.6f}[tail]"
                ),
                (
                    "[head_source]"
                    f"atrim=start=0:end={crossfade:.6f},"
                    "asetpts=PTS-STARTPTS,"
                    f"afade=t=in:st=0:d={crossfade:.6f}[head]"
                ),
                (
                    "[tail][head]"
                    "amix=inputs=2:normalize=0:duration=longest[seam]"
                ),
                (
                    "[body][seam]concat=n=2:v=0:a=1,"
                    f"aformat=sample_fmts=fltp:sample_rates={SAMPLE_RATE}:"
                    "channel_layouts=stereo[out]"
                ),
            ]
        )
    else:
        filter_parts.append(
            "[0:a:0]" + ",".join(input_filters) + "[out]"
        )

    prepared_pcm = _temporary_wav(target)
    render_command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-fflags",
        "+bitexact",
        "-filter_complex_threads",
        "1",
        "-i",
        str(source_path),
        "-filter_complex",
        ";".join(filter_parts),
        "-map",
        "[out]",
        "-vn",
        "-map_metadata",
        "-1",
        "-ar",
        str(SAMPLE_RATE),
        "-ac",
        "2",
        "-c:a",
        "pcm_s16le",
        "-threads",
        "1",
        "-flags:a",
        "+bitexact",
        str(prepared_pcm),
    ]
    temporary = _temporary_file(target, suffix=".ogg")
    rotation: dict | None = None
    try:
        _run_ffmpeg(render_command)
        prepared_metadata = _wav_metadata(prepared_pcm)
        rotation = (
            _stable_loop_rotation(
                prepared_pcm,
                preferred_rotation_seconds=preferred_rotation_seconds,
            )
            if should_loop
            else {
                "preEncodeBoundarySampleDelta": 0.0,
                "preEncodeLocalRmsDbfs": 0.0,
                "preEncodeWindowRmsDeltaDb": 0.0,
                "rotationFrames": 0,
                "rotationSeconds": 0.0,
                "searchSeconds": 0.0,
                "searchStepFrames": 0,
                "selectionMode": "not_looping",
                "windowMilliseconds": 0,
            }
        )
        rotation_frames = int(rotation["rotationFrames"])
        encode_command = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-fflags",
            "+bitexact",
            "-filter_complex_threads",
            "1",
            "-i",
            str(prepared_pcm),
        ]
        if rotation_frames > 0:
            rotate_filter = ";".join(
                [
                    "[0:a:0]asplit=2[after_source][before_source]",
                    (
                        "[after_source]"
                        f"atrim=start_sample={rotation_frames},"
                        "asetpts=PTS-STARTPTS[after]"
                    ),
                    (
                        "[before_source]"
                        f"atrim=end_sample={rotation_frames},"
                        "asetpts=PTS-STARTPTS[before]"
                    ),
                    (
                        "[after][before]concat=n=2:v=0:a=1,"
                        f"aformat=sample_fmts=fltp:"
                        f"sample_rates={SAMPLE_RATE}:"
                        "channel_layouts=stereo[out]"
                    ),
                ]
            )
            encode_command.extend(
                ["-filter_complex", rotate_filter, "-map", "[out]"]
            )
        else:
            encode_command.extend(["-map", "0:a:0"])
        encode_command.extend(
            [
                "-vn",
                "-map_metadata",
                "-1",
                "-fflags",
                "+bitexact",
                "-ar",
                str(SAMPLE_RATE),
                "-ac",
                "2",
                "-c:a",
                str(vorbis_encoder["name"]),
                "-q:a",
                str(VORBIS_QUALITY),
                "-threads",
                "1",
            ]
        )
        if bool(vorbis_encoder["strictExperimental"]):
            encode_command.extend(["-strict", "experimental"])
        encode_command.extend(
            [
                "-serial_offset",
                "0",
                "-flags:a",
                "+bitexact",
                str(temporary),
            ]
        )
        _run_ffmpeg(encode_command)
        encoded_metadata = _probe_audio(ffmpeg, temporary)
        if encoded_metadata["codecName"] != "vorbis":
            raise ValueError(
                f"{asset['assetId']}: expected Vorbis, got "
                f"{encoded_metadata['codecName']}"
            )
        metadata = _decoded_metadata(
            temporary,
            ffmpeg=ffmpeg,
            channels=2,
        )
        if metadata["channels"] != 2 or metadata["sampleRate"] != SAMPLE_RATE:
            raise ValueError(f"{asset['assetId']}: music must be 48 kHz stereo")
        if metadata["durationFrames"] != prepared_metadata["durationFrames"]:
            raise ValueError(
                f"{asset['assetId']}: rotation/encoding changed loop duration "
                f"from {prepared_metadata['durationFrames']} to "
                f"{metadata['durationFrames']} frames"
            )
        temporary.replace(target)
    finally:
        prepared_pcm.unlink(missing_ok=True)
        temporary.unlink(missing_ok=True)
    render_logical = _logical_command(
        render_command,
        actual_inputs=[source_path],
        logical_inputs=[f"source:{source['sourceId']}"],
        actual_output=prepared_pcm,
        logical_output=f"prepared-pcm:{asset['assetId']}",
    )
    encode_logical = _logical_command(
        encode_command,
        actual_inputs=[prepared_pcm],
        logical_inputs=[f"prepared-pcm:{asset['assetId']}"],
        actual_output=temporary,
        logical_output=f"runtime/music/{asset['filename']}",
    )
    logical = render_logical + " && " + encode_logical
    processing = {
        "appliedLoopCrossfadeSeconds": crossfade,
        "highpassHz": highpass_hz,
        "loopCrossfadeSeconds": requested_crossfade,
        "loopRotation": rotation,
        "masterGainDb": master_gain,
        "trimEndSeconds": trim_end,
        "trimStartSeconds": trim_start,
        "vorbisEncoder": str(vorbis_encoder["name"]),
        "vorbisFrameAlignmentAdjustmentFrames": (
            crossfade_alignment_frames
        ),
        "vorbisQuality": VORBIS_QUALITY,
    }
    return metadata, logical, processing


def _render_sfx(
    asset: dict,
    layers: list[dict],
    registry: dict[str, dict],
    target: Path,
    *,
    ffmpeg: str,
) -> tuple[dict, str]:
    source_paths: list[Path] = []
    logical_inputs: list[str] = []
    duration: float | None = None
    if "durationSeconds" in asset:
        duration = _safe_number(
            asset["durationSeconds"],
            field="durationSeconds",
            minimum=0.05,
            maximum=60.0,
        )
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-fflags",
        "+bitexact",
        "-filter_complex_threads",
        "1",
    ]
    filter_parts: list[str] = []
    for index, layer in enumerate(layers):
        source_id = str(layer.get("sourceId", ""))
        if source_id not in registry:
            raise ValueError(
                f"{asset['assetId']}: unknown sourceId {source_id!r}"
            )
        source_path = Path(registry[source_id]["_resolvedPath"])
        source_paths.append(source_path)
        logical_inputs.append(f"source:{source_id}")
        command.extend(["-threads", "1", "-i", str(source_path)])
        filter_parts.append(
            _layer_filter(
                layer,
                index,
                output_duration=duration,
            )
        )

    if len(layers) == 1:
        mixed_input = "[layer0]"
    else:
        layer_inputs = "".join(
            f"[layer{index}]" for index in range(len(layers))
        )
        filter_parts.append(
            f"{layer_inputs}amix=inputs={len(layers)}:"
            "duration=longest:dropout_transition=0:normalize=0[mixed]"
        )
        mixed_input = "[mixed]"

    final_filters: list[str] = []
    if duration is not None:
        final_filters.append(f"atrim=end={duration:.6f}")
    master_gain = _safe_number(
        asset.get("masterGainDb", 0.0),
        field="masterGainDb",
        minimum=-96.0,
        maximum=24.0,
    )
    if abs(master_gain) > 1e-9:
        final_filters.append(f"volume={master_gain:.3f}dB")
    final_filters.extend(
        [
            "afade=t=in:st=0:d=0.003",
            "areverse",
            "afade=t=in:st=0:d=0.040",
            "areverse",
            (
                f"aformat=sample_fmts=s16:sample_rates={SAMPLE_RATE}:"
                "channel_layouts=mono"
            ),
        ]
    )
    filter_parts.append(
        mixed_input + ",".join(final_filters) + "[out]"
    )
    temporary = _temporary_wav(target)
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
            str(SAMPLE_RATE),
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            "-threads",
            "1",
            "-flags:a",
            "+bitexact",
            str(temporary),
        ]
    )
    try:
        _run_ffmpeg(command)
        metadata = _wav_metadata(temporary)
        if metadata["channels"] != 1 or metadata["sampleRate"] != SAMPLE_RATE:
            raise ValueError(f"{asset['assetId']}: SFX must be 48 kHz mono")
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    logical = _logical_command(
        command,
        actual_inputs=source_paths,
        logical_inputs=logical_inputs,
        actual_output=temporary,
        logical_output=f"runtime/sfx/{asset['filename']}",
    )
    return metadata, logical


def _catalog_entry(asset: dict, runtime_path: str) -> dict:
    return {
        "assetId": asset["assetId"],
        "bus": asset["bus"],
        "cooldownMs": int(asset["cooldownMs"]),
        "gainDb": float(asset["gainDb"]),
        "loop": bool(asset["loop"]),
        "path": runtime_path,
        "priority": int(asset["priority"]),
        "role": asset["role"],
    }


def _spec_relative_path(
    spec_path: Path,
    *,
    bundle_root: Path,
    project_root: Path,
) -> str:
    for base in (project_root, bundle_root):
        try:
            return spec_path.relative_to(base).as_posix()
        except ValueError:
            continue
    return spec_path.name


def build_bundle(
    spec_path: Path,
    bundle_root: Path | None = None,
    *,
    ffmpeg: str = "ffmpeg",
    project_root: Path | None = None,
) -> dict:
    """Build the declared bundle and return a deterministic summary."""
    spec_path = Path(spec_path).resolve()
    bundle_root = (
        Path(bundle_root).resolve()
        if bundle_root is not None
        else spec_path.parents[1].resolve()
    )
    project_root = (
        Path(project_root).resolve()
        if project_root is not None
        else _repo_root()
    )
    spec = _read_json(spec_path)
    bundle_id = str(spec.get("bundleId", "")).strip()
    if not bundle_id or bundle_root.name != bundle_id:
        raise ValueError(
            f"bundle directory {bundle_root.name!r} must equal bundleId "
            f"{bundle_id!r}"
        )
    audio_format = spec.get("format", {})
    if int(audio_format.get("sampleRate", 0)) != SAMPLE_RATE:
        raise ValueError("Beastbound audio bundles must use 48 kHz")
    if int(audio_format.get("sampleWidthBits", 0)) != 16:
        raise ValueError(
            "sampleWidthBits declares the decoded PCM audit width and must be 16"
        )
    ffmpeg_info = _ffmpeg_version(ffmpeg)
    vorbis_encoder = _vorbis_encoder(ffmpeg)
    registry, source_records = _source_registry(
        spec,
        bundle_root=bundle_root,
        project_root=project_root,
    )

    cue_catalog: dict[str, dict] = {}
    ledger: list[dict] = []
    runtime_files: list[str] = []
    seen_asset_ids: set[str] = set()
    script_path = Path(__file__).resolve()
    spec_hash = _sha256_file(spec_path)
    resource_prefix = f"res://assets/audio/{bundle_id}/"
    spec_relative = _spec_relative_path(
        spec_path,
        bundle_root=bundle_root,
        project_root=project_root,
    )

    for group_name in ("music", "sfx"):
        assets = spec.get(group_name, [])
        if not isinstance(assets, list):
            raise ValueError(f"spec.{group_name} must be an array")
        for asset in assets:
            asset_id = str(asset.get("assetId", "")).strip()
            cue_id = str(asset.get("cueId", "")).strip()
            filename = str(asset.get("filename", "")).strip()
            if not asset_id or asset_id in seen_asset_ids:
                raise ValueError(f"invalid or duplicate assetId: {asset_id!r}")
            if not cue_id or cue_id in cue_catalog:
                raise ValueError(f"invalid or duplicate cueId: {cue_id!r}")
            if (
                not filename
                or Path(filename).name != filename
            ):
                raise ValueError(f"{asset_id}: filename must be a basename")
            expected_suffix = ".ogg" if group_name == "music" else ".wav"
            if Path(filename).suffix.lower() != expected_suffix:
                raise ValueError(
                    f"{asset_id}: {group_name} filename must end in "
                    f"{expected_suffix}"
                )
            seen_asset_ids.add(asset_id)
            relative_path = Path("runtime") / group_name / filename
            target = bundle_root / relative_path
            layers = _asset_layers(asset)
            source_ids = [str(layer.get("sourceId", "")) for layer in layers]
            music_processing: dict | None = None
            if group_name == "music":
                if len(layers) != 1:
                    raise ValueError(f"{asset_id}: music requires one source")
                source_id = source_ids[0]
                if source_id not in registry:
                    raise ValueError(
                        f"{asset_id}: unknown sourceId {source_id!r}"
                    )
                metadata, command, music_processing = _render_music(
                    asset,
                    registry[source_id],
                    target,
                    ffmpeg=ffmpeg,
                    vorbis_encoder=vorbis_encoder,
                )
            else:
                metadata, command = _render_sfx(
                    asset,
                    layers,
                    registry,
                    target,
                    ffmpeg=ffmpeg,
                )

            runtime_path = resource_prefix + relative_path.as_posix()
            runtime_hash = _sha256_file(target)
            cue_catalog[cue_id] = _catalog_entry(asset, runtime_path)
            source_types = sorted(
                {str(registry[source_id]["sourceType"]) for source_id in source_ids}
            )
            ledger_entry = {
                    "assetId": asset_id,
                    "authorTool": (
                        "Beastbound FFmpeg layered audio builder "
                        f"{GENERATOR_VERSION}"
                    ),
                    "channels": metadata["channels"],
                    "cueIds": [cue_id],
                    "durationFrames": metadata["durationFrames"],
                    "durationSeconds": metadata["durationSeconds"],
                    "license": "See sourceRecords by sourceIds",
                    "ownershipBasis": spec["ownership"]["basis"],
                    "processing": (
                        "FFmpeg 8 deterministic processing; music is trimmed, "
                        "circularly crossfaded, gain staged, and encoded as "
                        "48 kHz stereo Ogg Vorbis; SFX uses mono amix "
                        "normalize=0 plus 3 ms fade-in and 40 ms fade-out"
                    ),
                    "processingCommand": command,
                    "replacementPath": spec["ownership"]["replacementPath"],
                    "reviewState": spec["reviewState"],
                    "role": asset["role"],
                    "runtimePath": runtime_path,
                    "runtimeSha256": runtime_hash,
                    "sampleRate": metadata["sampleRate"],
                    "sourceIds": source_ids,
                    "sourceSpecificationFragmentSha256": _json_fragment_hash(
                        asset
                    ),
                    "sourceSpecificationPath": spec_relative,
                    "sourceType": (
                        source_types[0]
                        if len(source_types) == 1
                        else "mixed:" + ",".join(source_types)
                    ),
                }
            if music_processing is not None:
                ledger_entry["musicProcessing"] = music_processing
            ledger.append(ledger_entry)
            runtime_files.append(relative_path.as_posix())

    required_cues = set(spec.get("requiredCanonicalCues", []))
    if required_cues != set(cue_catalog):
        raise ValueError(
            "requiredCanonicalCues must exactly match generated cueIds; "
            f"missing={sorted(required_cues - set(cue_catalog))}, "
            f"extra={sorted(set(cue_catalog) - required_cues)}"
        )

    catalog = {
        "bundleId": bundle_id,
        "contexts": spec["contexts"],
        "cues": dict(sorted(cue_catalog.items())),
        "format": {
            "music": (
                "48 kHz stereo Ogg Vorbis quality "
                f"{VORBIS_QUALITY}"
            ),
            "sampleRate": SAMPLE_RATE,
            "sfx": "48 kHz mono PCM16 WAV",
        },
        "mixDefaults": spec["mixDefaults"],
        "reviewState": spec["reviewState"],
        "schemaVersion": 3,
    }
    catalog_path = bundle_root / "audio-cues.json"
    _write_json(catalog_path, catalog)

    provenance = {
        "bundleId": bundle_id,
        "freezeTimestampUtc": spec["freezeTimestampUtc"],
        "generator": {
            "ffmpegMajor": ffmpeg_info["major"],
            "ffmpegVersion": ffmpeg_info["versionLine"],
            "implementation": (
                ".agents/skills/design-beastbound-audio/scripts/"
                "build_cc0_audio_bundle.py"
            ),
            "implementationSha256": _sha256_file(script_path),
            "pythonImplementation": platform.python_implementation(),
            "version": GENERATOR_VERSION,
            "vorbisEncoder": vorbis_encoder["name"],
            "vorbisQuality": VORBIS_QUALITY,
        },
        "ledger": sorted(ledger, key=lambda item: item["assetId"]),
        "musicRuntimeFormatDecision": audio_format[
            "musicRuntimeFormatDecision"
        ],
        "reviewState": spec["reviewState"],
        "schemaVersion": 3,
        "sourceRecords": source_records,
        "sourceSpecificationSha256": spec_hash,
    }
    provenance_path = bundle_root / "source/provenance.json"
    _write_json(provenance_path, provenance)

    return {
        "bundleId": bundle_id,
        "catalog": str(catalog_path),
        "fileCount": len(runtime_files),
        "provenance": str(provenance_path),
        "runtimeFiles": sorted(runtime_files),
        "sourceCount": len(source_records),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--spec",
        type=Path,
        default=_default_spec_path(),
        help="canonical source specification",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="bundle root (defaults to the spec's grandparent)",
    )
    parser.add_argument(
        "--ffmpeg",
        default="ffmpeg",
        help="FFmpeg 8 executable",
    )
    args = parser.parse_args()
    summary = build_bundle(args.spec, args.output, ffmpeg=args.ffmpeg)
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
