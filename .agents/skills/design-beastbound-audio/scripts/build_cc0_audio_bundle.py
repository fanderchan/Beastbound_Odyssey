#!/usr/bin/env python3
"""Build a provenance-locked Beastbound audio bundle with FFmpeg 8.

The source specification lives at ``<bundle>/source/spec.json``. Music is
decoded from one declared project/source asset and kept stereo. Short effects
are built from one or more declared layers, mixed without automatic
normalization, edge-faded, and emitted as 48 kHz mono PCM16 WAV.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import platform
import re
import shlex
import subprocess
import tempfile
import wave


GENERATOR_VERSION = "2.0.0"
REQUIRED_FFMPEG_MAJOR = 8
SAMPLE_RATE = 48000


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


def _layer_filter(layer: dict, index: int) -> str:
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
    return f"[{index}:a:0]" + ",".join(filters) + f"[layer{index}]"


def _temporary_wav(target: Path) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        prefix=f".{target.stem}.",
        suffix=".wav",
        dir=target.parent,
        delete=False,
    )
    handle.close()
    return Path(handle.name)


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
) -> tuple[dict, str]:
    source_path = Path(source["_resolvedPath"])
    temporary = _temporary_wav(target)
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-fflags",
        "+bitexact",
        "-i",
        str(source_path),
        "-map",
        "0:a:0",
        "-vn",
        "-map_metadata",
        "-1",
        "-ar",
        str(SAMPLE_RATE),
        "-ac",
        "2",
        "-c:a",
        "pcm_s16le",
        "-flags:a",
        "+bitexact",
        str(temporary),
    ]
    try:
        _run_ffmpeg(command)
        metadata = _wav_metadata(temporary)
        if metadata["channels"] != 2 or metadata["sampleRate"] != SAMPLE_RATE:
            raise ValueError(f"{asset['assetId']}: music must be 48 kHz stereo")
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    logical = _logical_command(
        command,
        actual_inputs=[source_path],
        logical_inputs=[f"source:{source['sourceId']}"],
        actual_output=temporary,
        logical_output=f"runtime/music/{asset['filename']}",
    )
    return metadata, logical


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
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-fflags",
        "+bitexact",
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
        command.extend(["-i", str(source_path)])
        filter_parts.append(_layer_filter(layer, index))

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
    if "durationSeconds" in asset:
        duration = _safe_number(
            asset["durationSeconds"],
            field="durationSeconds",
            minimum=0.05,
            maximum=60.0,
        )
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
        raise ValueError("this generator emits PCM16 only")
    ffmpeg_info = _ffmpeg_version(ffmpeg)
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
                or Path(filename).suffix.lower() != ".wav"
            ):
                raise ValueError(f"{asset_id}: filename must be a WAV basename")
            seen_asset_ids.add(asset_id)
            relative_path = Path("runtime") / group_name / filename
            target = bundle_root / relative_path
            layers = _asset_layers(asset)
            source_ids = [str(layer.get("sourceId", "")) for layer in layers]
            if group_name == "music":
                if len(layers) != 1:
                    raise ValueError(f"{asset_id}: music requires one source")
                source_id = source_ids[0]
                if source_id not in registry:
                    raise ValueError(
                        f"{asset_id}: unknown sourceId {source_id!r}"
                    )
                metadata, command = _render_music(
                    asset,
                    registry[source_id],
                    target,
                    ffmpeg=ffmpeg,
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
            ledger.append(
                {
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
                        "FFmpeg 8 deterministic decode/mix; music remains "
                        "stereo, SFX uses mono amix normalize=0 plus 3 ms "
                        "fade-in and 40 ms fade-out"
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
            )
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
            "music": "48 kHz stereo PCM16 WAV",
            "sampleRate": SAMPLE_RATE,
            "sfx": "48 kHz mono PCM16 WAV",
        },
        "mixDefaults": spec["mixDefaults"],
        "reviewState": spec["reviewState"],
        "schemaVersion": 2,
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
        },
        "ledger": sorted(ledger, key=lambda item: item["assetId"]),
        "musicRuntimeFormatDecision": audio_format[
            "musicRuntimeFormatDecision"
        ],
        "reviewState": spec["reviewState"],
        "schemaVersion": 2,
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
