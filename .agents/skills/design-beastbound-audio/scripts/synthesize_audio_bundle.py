#!/usr/bin/env python3
"""Build Beastbound's deterministic, original first-pass audio bundle.

The synthesizer intentionally uses only the Python standard library. Runtime
PCM16 WAV files are bit-for-bit reproducible across repeated builds from the
same specification and avoid relying on a machine-specific audio encoder.
"""

from __future__ import annotations

import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import platform
import struct
import sys
import wave


GENERATOR_VERSION = "1.0.0"
TAU = math.tau


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _default_spec_path() -> Path:
    return (
        _repo_root()
        / "client/godot/assets/audio/beastbound_audio_v1/source/spec.json"
    )


def _read_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    path.write_text(text, encoding="utf-8")


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _db_to_linear(db: float) -> float:
    return 10.0 ** (db / 20.0)


def _midi_frequency(note: float) -> float:
    return 440.0 * (2.0 ** ((note - 69.0) / 12.0))


def _triangle(phase: float) -> float:
    return (2.0 / math.pi) * math.asin(math.sin(phase))


def _hash_noise(sample_index: int, seed: int) -> float:
    value = (sample_index ^ (seed * 0x45D9F3B)) & 0xFFFFFFFF
    value = ((value >> 16) ^ value) * 0x45D9F3B & 0xFFFFFFFF
    value = ((value >> 16) ^ value) * 0x45D9F3B & 0xFFFFFFFF
    value = (value >> 16) ^ value
    return ((value & 0xFFFF) / 32767.5) - 1.0


def _soft_clip(value: float) -> float:
    return math.tanh(value)


def _condition_loop_seam(
    samples: array,
    *,
    channels: int,
    sample_rate: int,
    window_milliseconds: int = 20,
) -> None:
    """Match edge energy without fading the musical bed to silence.

    The synthesizer already makes the boundary sample continuous. This small,
    deterministic gain fold equalizes the final and initial 20 ms so the loop
    does not jump in perceived level. A 10 ms shoulder outside each measured
    window returns to unity gain and avoids a hard internal gain step.
    """
    frame_count = len(samples) // channels
    window_frames = int(sample_rate * window_milliseconds / 1000)
    shoulder_frames = max(1, window_frames // 2)
    if frame_count <= (window_frames + shoulder_frames) * 2:
        raise ValueError("music loop is too short for seam conditioning")

    head_end = window_frames * channels
    tail_start = (frame_count - window_frames) * channels
    head_rms = math.sqrt(
        sum(value * value for value in samples[:head_end]) / head_end
    )
    tail_rms = math.sqrt(
        sum(value * value for value in samples[tail_start:])
        / (len(samples) - tail_start)
    )
    if head_rms <= 1e-12 or tail_rms <= 1e-12:
        raise ValueError("loop seam conditioning cannot repair a silent edge")
    geometric_mean = math.sqrt(head_rms * tail_rms)
    head_gain = geometric_mean / head_rms
    tail_gain = geometric_mean / tail_rms
    if max(head_gain, tail_gain) > 2.0:
        raise ValueError("loop seam requires excessive gain correction")

    for frame in range(window_frames):
        for channel in range(channels):
            index = frame * channels + channel
            samples[index] *= head_gain
    for frame in range(window_frames, window_frames + shoulder_frames):
        position = (frame - window_frames + 1) / shoulder_frames
        smooth = position * position * (3.0 - 2.0 * position)
        gain = head_gain + (1.0 - head_gain) * smooth
        for channel in range(channels):
            index = frame * channels + channel
            samples[index] *= gain

    tail_shoulder_start = frame_count - window_frames - shoulder_frames
    for frame in range(tail_shoulder_start, frame_count - window_frames):
        position = (frame - tail_shoulder_start + 1) / shoulder_frames
        smooth = position * position * (3.0 - 2.0 * position)
        gain = 1.0 + (tail_gain - 1.0) * smooth
        for channel in range(channels):
            index = frame * channels + channel
            samples[index] *= gain
    for frame in range(frame_count - window_frames, frame_count):
        for channel in range(channels):
            index = frame * channels + channel
            samples[index] *= tail_gain

    for channel in range(channels):
        first_index = channel
        final_index = (frame_count - 1) * channels + channel
        seam_value = (samples[first_index] + samples[final_index]) * 0.5
        samples[first_index] = seam_value
        samples[final_index] = seam_value


def _scaled_pcm16(samples: array, target_peak_dbfs: float) -> array:
    mean = sum(samples) / max(1, len(samples))
    peak = max((abs(value - mean) for value in samples), default=0.0)
    target = _db_to_linear(target_peak_dbfs)
    scale = target / peak if peak > 0.0 else 0.0
    output = array("h")
    output.extend(
        max(
            -32768,
            min(32767, int(round((value - mean) * scale * 32767.0))),
        )
        for value in samples
    )
    return output


def _write_wav(
    path: Path,
    samples: array,
    *,
    sample_rate: int,
    channels: int,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = samples
    if sys.byteorder != "little":
        pcm = array("h", samples)
        pcm.byteswap()
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())


def _music_voice_palette(name: str) -> tuple[float, float, float, float]:
    palettes = {
        "warm_plucked": (0.62, 0.23, 0.10, 0.05),
        "open_air": (0.42, 0.30, 0.10, 0.18),
        "stone_echo": (0.34, 0.18, 0.34, 0.14),
        "battle_drums": (0.38, 0.21, 0.08, 0.33),
    }
    if name not in palettes:
        raise ValueError(f"unknown music palette: {name}")
    return palettes[name]


def _render_music(asset: dict, sample_rate: int) -> tuple[array, int]:
    bpm = float(asset["bpm"])
    bars = int(asset["bars"])
    beats_per_bar = int(asset.get("beatsPerBar", 4))
    duration = bars * beats_per_bar * 60.0 / bpm
    frames = int(round(duration * sample_rate))
    key_midi = int(asset["keyMidi"])
    scale = [int(value) for value in asset["scale"]]
    chord_roots = [int(value) for value in asset["chordRoots"]]
    melody_steps = asset["melodySteps"]
    palette = _music_voice_palette(str(asset["palette"]))
    seed = int(asset["seed"])
    ambience_cycles = int(asset.get("ambienceCycles", 11))
    raw = array("f")

    for frame in range(frames):
        time_s = frame / sample_rate
        beat = time_s * bpm / 60.0
        bar_index = int(beat / beats_per_bar) % bars
        beat_in_bar = beat - math.floor(beat / beats_per_bar) * beats_per_bar
        half_beat = beat * 2.0
        melody_index = int(half_beat) % len(melody_steps)
        half_phase = half_beat - math.floor(half_beat)
        beat_phase = beat - math.floor(beat)
        bar_phase = beat_in_bar / beats_per_bar
        chord_root = chord_roots[bar_index % len(chord_roots)]

        melody = 0.0
        melody_degree = melody_steps[melody_index]
        if melody_degree is not None:
            scale_index = int(melody_degree)
            octave, degree = divmod(scale_index, len(scale))
            note = key_midi + scale[degree] + octave * 12
            frequency = _midi_frequency(note)
            envelope = math.sin(math.pi * half_phase) ** 1.7
            phase = TAU * frequency * time_s
            melody = (
                math.sin(phase) * 0.72
                + _triangle(phase * 2.0) * 0.20
                + math.sin(phase * 3.0) * 0.08
            ) * envelope

        bass_note = key_midi - 24 + chord_root
        bass_frequency = _midi_frequency(bass_note)
        bass_envelope = math.sin(math.pi * beat_phase) ** 0.8
        bass_phase = TAU * bass_frequency * time_s
        bass = (
            math.sin(bass_phase) * 0.82
            + _triangle(bass_phase) * 0.18
        ) * bass_envelope

        pad_envelope = math.sin(math.pi * bar_phase) ** 1.20
        chord = 0.0
        chord_intervals = (0, 4 if 4 in scale else 3, 7)
        for interval_index, interval in enumerate(chord_intervals):
            pad_frequency = _midi_frequency(key_midi - 12 + chord_root + interval)
            slow_detune = 1.0 + (interval_index - 1) * 0.0016
            chord += math.sin(TAU * pad_frequency * slow_detune * time_s)
        chord = chord / len(chord_intervals) * pad_envelope

        percussion = 0.0
        percussion_beat_phase = (beat + 0.5) - math.floor(beat + 0.5)
        kick_window = percussion_beat_phase
        if kick_window < 0.16:
            local = kick_window / 0.16
            kick_frequency = 78.0 - 34.0 * local
            percussion += math.sin(TAU * kick_frequency * kick_window) * (
                1.0 - local
            ) ** 2.0
        eighth_phase = (beat * 2.0 + 0.5) - math.floor(beat * 2.0 + 0.5)
        if eighth_phase < 0.10:
            local = eighth_phase / 0.10
            noise = _hash_noise(frame, seed + 97)
            onset = min(1.0, local / 0.08)
            percussion += noise * onset * (1.0 - local) ** 3.0 * 0.40

        ambience_phase = TAU * ambience_cycles * frame / frames
        ambience = (
            math.sin(ambience_phase)
            + 0.32 * math.sin(ambience_phase * 2.0)
        ) * 0.5

        voice = (
            melody * palette[0]
            + bass * palette[1]
            + chord * palette[2]
            + percussion * palette[3]
        )
        voice += ambience * float(asset.get("ambienceAmount", 0.04))
        voice = _soft_clip(voice * 0.92)

        pan = float(asset.get("panWidth", 0.24)) * math.sin(
            TAU * frame / frames * int(asset.get("panCycles", 2))
        )
        left = voice * math.sqrt((1.0 - pan) * 0.5)
        right = voice * math.sqrt((1.0 + pan) * 0.5)
        raw.append(left)
        raw.append(right)

    _condition_loop_seam(raw, channels=2, sample_rate=sample_rate)
    return _scaled_pcm16(raw, float(asset["targetPeakDbfs"])), frames


def _chirp(time_s: float, duration: float, start_hz: float, end_hz: float) -> float:
    sweep = (end_hz - start_hz) / max(duration, 1e-9)
    return math.sin(TAU * (start_hz * time_s + 0.5 * sweep * time_s * time_s))


def _envelope(position: float, attack: float = 0.04, decay_power: float = 2.0) -> float:
    attack_gain = min(1.0, position / max(attack, 1e-6))
    return attack_gain * ((1.0 - position) ** decay_power)


def _render_sfx(asset: dict, sample_rate: int) -> tuple[array, int]:
    duration = float(asset["durationSeconds"])
    frames = int(round(duration * sample_rate))
    seed = int(asset["seed"])
    kind = str(asset["kind"])
    start_hz = float(asset.get("startHz", 180.0))
    end_hz = float(asset.get("endHz", 520.0))
    tone_hz = float(asset.get("toneHz", 440.0))
    raw = array("f")

    for frame in range(frames):
        time_s = frame / sample_rate
        position = frame / max(1, frames - 1)
        noise = _hash_noise(frame, seed)
        signal = 0.0

        if kind == "whoosh":
            env = math.sin(math.pi * position) ** 1.4
            signal = (
                noise * 0.62
                + _chirp(time_s, duration, start_hz, end_hz) * 0.30
                + math.sin(TAU * start_hz * 0.5 * time_s) * 0.08
            ) * env
        elif kind == "impact":
            env = _envelope(position, 0.012, 3.4)
            low = _chirp(time_s, duration, start_hz, end_hz)
            signal = (low * 0.58 + noise * 0.42) * env
        elif kind == "metal":
            env = _envelope(position, 0.008, 2.2)
            signal = (
                math.sin(TAU * tone_hz * time_s) * 0.52
                + math.sin(TAU * tone_hz * 1.618 * time_s) * 0.28
                + math.sin(TAU * tone_hz * 2.41 * time_s) * 0.20
            ) * env
        elif kind == "pulse":
            env = _envelope(position, 0.025, 1.7)
            signal = (
                _chirp(time_s, duration, start_hz, end_hz) * 0.66
                + math.sin(TAU * tone_hz * time_s) * 0.24
                + noise * 0.10
            ) * env
        elif kind == "sparkle":
            env = math.sin(math.pi * position) ** 0.8
            signal = (
                _chirp(time_s, duration, start_hz, end_hz) * 0.46
                + math.sin(TAU * tone_hz * time_s) * 0.28
                + math.sin(TAU * tone_hz * 1.5 * time_s) * 0.18
                + noise * 0.08
            ) * env
        elif kind == "voice":
            env = math.sin(math.pi * position) ** 0.9
            vibrato = 1.0 + 0.035 * math.sin(TAU * 12.0 * time_s)
            formant = _chirp(time_s, duration, start_hz, end_hz)
            signal = (
                formant * 0.58
                + math.sin(TAU * tone_hz * vibrato * time_s) * 0.30
                + noise * 0.12
            ) * env
        elif kind == "motif":
            notes = [float(value) for value in asset["notesHz"]]
            note_position = position * len(notes)
            note_index = min(len(notes) - 1, int(note_position))
            local = note_position - note_index
            env = math.sin(math.pi * local) ** 1.2
            frequency = notes[note_index]
            signal = (
                math.sin(TAU * frequency * time_s) * 0.72
                + math.sin(TAU * frequency * 2.0 * time_s) * 0.20
                + math.sin(TAU * frequency * 3.0 * time_s) * 0.08
            ) * env
        else:
            raise ValueError(f"unknown SFX kind: {kind}")

        edge = min(1.0, position / 0.006, (1.0 - position) / 0.006)
        raw.append(_soft_clip(signal * 0.96) * max(0.0, edge))

    return _scaled_pcm16(raw, float(asset["targetPeakDbfs"])), frames


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


def build_bundle(spec_path: Path, bundle_root: Path | None = None) -> dict:
    """Build a bundle and return a deterministic summary."""
    spec_path = Path(spec_path).resolve()
    spec = _read_json(spec_path)
    bundle_root = (
        Path(bundle_root).resolve()
        if bundle_root is not None
        else spec_path.parents[1].resolve()
    )
    sample_rate = int(spec["format"]["sampleRate"])
    if sample_rate != 48000:
        raise ValueError("Beastbound audio bundles must use 48 kHz")
    if int(spec["format"]["sampleWidthBits"]) != 16:
        raise ValueError("this generator emits PCM16 only")

    cue_catalog: dict[str, dict] = {}
    ledger: list[dict] = []
    written_files: list[str] = []
    script_path = Path(__file__).resolve()
    spec_hash = _sha256_file(spec_path)

    for group_name, renderer, channels in (
        ("music", _render_music, 2),
        ("sfx", _render_sfx, 1),
    ):
        for asset in spec[group_name]:
            relative_path = Path("runtime") / group_name / asset["filename"]
            target = bundle_root / relative_path
            samples, frames = renderer(asset, sample_rate)
            _write_wav(
                target,
                samples,
                sample_rate=sample_rate,
                channels=channels,
            )
            runtime_hash = _sha256_file(target)
            source_fragment = json.dumps(
                asset, ensure_ascii=False, sort_keys=True, separators=(",", ":")
            ).encode("utf-8")
            source_hash = _sha256_bytes(source_fragment)
            cue_id = str(asset["cueId"])
            runtime_res_path = (
                "res://assets/audio/beastbound_audio_v1/" + relative_path.as_posix()
            )
            cue_catalog[cue_id] = _catalog_entry(asset, runtime_res_path)
            ledger.append(
                {
                    "assetId": asset["assetId"],
                    "authorTool": (
                        "Beastbound deterministic stdlib synthesizer "
                        f"{GENERATOR_VERSION}"
                    ),
                    "channels": channels,
                    "cueIds": [cue_id],
                    "durationFrames": frames,
                    "durationSeconds": round(frames / sample_rate, 6),
                    "license": "Original project-owned procedural composition/sound",
                    "ownershipBasis": spec["ownership"]["basis"],
                    "processing": (
                        "Direct deterministic synthesis, zero-DC centering, and "
                        "20 ms edge-energy loop conditioning to little-endian "
                        "PCM16 WAV; no downloaded samples, silence fade, or "
                        "external encoder"
                    ),
                    "replacementPath": spec["ownership"]["replacementPath"],
                    "reviewState": spec["reviewState"],
                    "role": asset["role"],
                    "runtimePath": runtime_res_path,
                    "runtimeSha256": runtime_hash,
                    "sampleRate": sample_rate,
                    "seed": int(asset["seed"]),
                    "sourceSpecificationPath": (
                        "client/godot/assets/audio/beastbound_audio_v1/source/spec.json"
                    ),
                    "sourceSpecificationFragmentSha256": source_hash,
                    "sourceType": "procedural_original",
                }
            )
            written_files.append(relative_path.as_posix())

    catalog = {
        "bundleId": spec["bundleId"],
        "contexts": spec["contexts"],
        "cues": dict(sorted(cue_catalog.items())),
        "format": {
            "music": "PCM16 WAV first pass; catalog loop flag is authoritative",
            "sampleRate": sample_rate,
            "sfx": "PCM16 WAV",
        },
        "mixDefaults": spec["mixDefaults"],
        "reviewState": spec["reviewState"],
        "schemaVersion": 1,
    }
    catalog_path = bundle_root / "audio-cues.json"
    _write_json(catalog_path, catalog)

    provenance = {
        "bundleId": spec["bundleId"],
        "freezeTimestampUtc": spec["freezeTimestampUtc"],
        "generator": {
            "implementation": (
                ".agents/skills/design-beastbound-audio/scripts/"
                "synthesize_audio_bundle.py"
            ),
            "implementationSha256": _sha256_file(script_path),
            "pythonImplementation": platform.python_implementation(),
            "standardLibraryOnly": True,
            "version": GENERATOR_VERSION,
        },
        "ledger": sorted(ledger, key=lambda item: item["assetId"]),
        "musicRuntimeFormatDecision": spec["format"]["musicRuntimeFormatDecision"],
        "reviewState": spec["reviewState"],
        "schemaVersion": 1,
        "sourceSpecificationSha256": spec_hash,
    }
    provenance_path = bundle_root / "source/provenance.json"
    _write_json(provenance_path, provenance)

    return {
        "bundleId": spec["bundleId"],
        "catalog": str(catalog_path),
        "fileCount": len(written_files),
        "provenance": str(provenance_path),
        "runtimeFiles": sorted(written_files),
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
    args = parser.parse_args()
    summary = build_bundle(args.spec, args.output)
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
