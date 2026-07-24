#!/usr/bin/env python3
"""Regression tests for the deterministic Beastbound audio pipeline."""

from __future__ import annotations

import importlib.util
import hashlib
import json
import math
from pathlib import Path
import shutil
import tempfile
import unittest
import wave


REPO_ROOT = Path(__file__).resolve().parents[4]
SKILL_ROOT = REPO_ROOT / ".agents/skills/design-beastbound-audio"
SPEC_PATH = (
    REPO_ROOT
    / "client/godot/assets/audio/beastbound_audio_v1/source/spec.json"
)


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SYNTH = _load_module(
    "beastbound_audio_synth",
    SKILL_ROOT / "scripts/synthesize_audio_bundle.py",
)
AUDIT = _load_module(
    "beastbound_audio_audit",
    SKILL_ROOT / "scripts/audit_audio_bundle.py",
)
LAYERED = _load_module(
    "beastbound_audio_layered",
    SKILL_ROOT / "scripts/build_cc0_audio_bundle.py",
)


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def _write_sine_wav(
    path: Path,
    *,
    frequency: float,
    duration_seconds: float,
    channels: int,
    sample_rate: int = 48000,
    amplitude: float = 0.18,
    close_loop: bool = False,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame_count = int(round(duration_seconds * sample_rate))
    payload = bytearray()
    for frame in range(frame_count):
        value = amplitude * math.sin(
            math.tau * frequency * frame / sample_rate
        )
        if close_loop and frame == frame_count - 1:
            value = 0.0
        sample = max(-32768, min(32767, int(round(value * 32767.0))))
        payload.extend(sample.to_bytes(2, "little", signed=True) * channels)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(payload)


class AudioPipelineTest(unittest.TestCase):
    def _prepare_bundle(self, root: Path) -> Path:
        bundle = root / "beastbound_audio_v1"
        (bundle / "source").mkdir(parents=True)
        shutil.copy2(SPEC_PATH, bundle / "source/spec.json")
        SYNTH.build_bundle(bundle / "source/spec.json", bundle)
        return bundle

    def _prepare_layered_bundle(self, root: Path) -> tuple[Path, dict]:
        bundle = root / "beastbound_audio_test"
        vendor = bundle / "source/vendor"
        music_sources: list[dict] = []
        music_assets: list[dict] = []
        contexts: dict[str, str] = {}
        for context, frequency in (
            ("town", 110.0),
            ("wilderness", 220.0),
            ("cave", 330.0),
            ("battle_normal", 440.0),
        ):
            source_id = f"test_music_{context}"
            path = vendor / f"{source_id}.wav"
            _write_sine_wav(
                path,
                frequency=frequency,
                duration_seconds=1.0,
                channels=2,
                close_loop=True,
            )
            cue_id = f"music.{context}"
            contexts[context] = cue_id
            music_sources.append(
                {
                    "author": "Beastbound test fixture",
                    "expectedSha256": _sha256_file(path),
                    "licenseName": "CC0-1.0",
                    "licenseUrl": (
                        "https://creativecommons.org/publicdomain/zero/1.0/"
                    ),
                    "sourceId": source_id,
                    "sourcePath": f"source/vendor/{path.name}",
                    "sourceType": "licensed_cc0",
                }
            )
            music_assets.append(
                {
                    "assetId": f"{source_id}_asset",
                    "bus": "Music",
                    "cooldownMs": 0,
                    "cueId": cue_id,
                    "filename": f"{context}_loop.wav",
                    "gainDb": -6.0,
                    "loop": True,
                    "priority": 100,
                    "projectCopy": {"sourceId": source_id},
                    "role": "music",
                }
            )

        layer_sources: list[dict] = []
        for index, frequency in enumerate((96.0, 720.0)):
            source_id = f"test_impact_{index}"
            path = vendor / f"{source_id}.wav"
            _write_sine_wav(
                path,
                frequency=frequency,
                duration_seconds=0.35,
                channels=1,
                sample_rate=44100,
                amplitude=0.12,
            )
            layer_sources.append(
                {
                    "author": "Beastbound test fixture",
                    "expectedSha256": _sha256_file(path),
                    "licenseName": "CC0-1.0",
                    "licenseUrl": (
                        "https://creativecommons.org/publicdomain/zero/1.0/"
                    ),
                    "sourceId": source_id,
                    "sourcePageUrl": "https://example.invalid/test-source",
                    "sourcePath": f"source/vendor/{path.name}",
                    "sourceType": "licensed_cc0",
                }
            )

        spec = {
            "bundleId": bundle.name,
            "contexts": contexts,
            "format": {
                "musicRuntimeFormatDecision": (
                    "Test fixture music remains stereo PCM16 WAV."
                ),
                "sampleRate": 48000,
                "sampleWidthBits": 16,
            },
            "freezeTimestampUtc": "2026-07-24T00:00:00Z",
            "mixDefaults": {
                "crossfadeSeconds": 0.75,
                "musicGainDb": -4.0,
                "sfxGainDb": -1.5,
                "sfxVoiceCap": 12,
            },
            "music": music_assets,
            "ownership": {
                "basis": "CC0 test fixtures generated by this unit test.",
                "replacementPath": "Delete with the temporary test bundle.",
            },
            "requiredCanonicalCues": [
                *(asset["cueId"] for asset in music_assets),
                "combat.hit_light",
            ],
            "reviewState": "owner_listening_pending",
            "schemaVersion": 2,
            "sfx": [
                {
                    "assetId": "test_hit_light_asset",
                    "bus": "Combat",
                    "cooldownMs": 45,
                    "cueId": "combat.hit_light",
                    "durationSeconds": 0.27,
                    "filename": "combat_hit_light.wav",
                    "gainDb": -1.0,
                    "layers": [
                        {
                            "delayMs": 0,
                            "gainDb": -8.0,
                            "highpassHz": 40,
                            "lowpassHz": 5000,
                            "pitchScale": 0.9,
                            "sourceId": "test_impact_0",
                            "trimEndSeconds": 0.30,
                            "trimStartSeconds": 0.01,
                        },
                        {
                            "delayMs": 18,
                            "gainDb": -12.0,
                            "highpassHz": 200,
                            "lowpassHz": 9000,
                            "pitchScale": 1.1,
                            "sourceId": "test_impact_1",
                            "trimEndSeconds": 0.24,
                        },
                    ],
                    "loop": False,
                    "masterGainDb": -3.0,
                    "priority": 52,
                    "role": "contact",
                }
            ],
            "sources": [*music_sources, *layer_sources],
        }
        spec_path = bundle / "source/spec.json"
        spec_path.write_text(
            json.dumps(spec, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        LAYERED.build_bundle(
            spec_path,
            bundle,
            project_root=root,
        )
        return bundle, spec

    def test_canonical_bundle_passes_auditor(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle = self._prepare_bundle(Path(temporary))
            report = AUDIT.audit_bundle(bundle, write_report=False)
            self.assertEqual(report["status"], "pass", report["failures"])
            self.assertEqual(report["assetCount"], 26)

    def test_repeated_builds_are_bit_exact(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = self._prepare_bundle(root / "first")
            second = self._prepare_bundle(root / "second")
            first_provenance = json.loads(
                (first / "source/provenance.json").read_text(encoding="utf-8")
            )
            second_provenance = json.loads(
                (second / "source/provenance.json").read_text(encoding="utf-8")
            )
            first_hashes = {
                item["runtimePath"]: item["runtimeSha256"]
                for item in first_provenance["ledger"]
            }
            second_hashes = {
                item["runtimePath"]: item["runtimeSha256"]
                for item in second_provenance["ledger"]
            }
            self.assertEqual(first_hashes, second_hashes)
            self.assertEqual(
                (first / "audio-cues.json").read_bytes(),
                (second / "audio-cues.json").read_bytes(),
            )

    def test_wrong_sample_rate_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            bundle = self._prepare_bundle(Path(temporary))
            source = bundle / "runtime/sfx/ui_confirm.wav"
            with wave.open(str(source), "rb") as handle:
                channels = handle.getnchannels()
                width = handle.getsampwidth()
                frames = handle.readframes(handle.getnframes())
            with wave.open(str(source), "wb") as handle:
                handle.setnchannels(channels)
                handle.setsampwidth(width)
                handle.setframerate(44100)
                handle.writeframes(frames)
            report = AUDIT.audit_bundle(bundle, write_report=False)
            failure_codes = {failure["code"] for failure in report["failures"]}
            self.assertIn("sample_rate", failure_codes)
            self.assertIn("hash_mismatch", failure_codes)

    @unittest.skipUnless(shutil.which("ffmpeg"), "FFmpeg is unavailable")
    def test_layered_builder_emits_dynamic_catalog_and_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bundle, spec = self._prepare_layered_bundle(root)
            with wave.open(
                str(bundle / "runtime/sfx/combat_hit_light.wav"),
                "rb",
            ) as handle:
                self.assertEqual(handle.getframerate(), 48000)
                self.assertEqual(handle.getnchannels(), 1)
                self.assertEqual(handle.getsampwidth(), 2)
            with wave.open(
                str(bundle / "runtime/music/town_loop.wav"),
                "rb",
            ) as handle:
                self.assertEqual(handle.getframerate(), 48000)
                self.assertEqual(handle.getnchannels(), 2)
                self.assertEqual(handle.getsampwidth(), 2)

            catalog = json.loads(
                (bundle / "audio-cues.json").read_text(encoding="utf-8")
            )
            cue = catalog["cues"]["combat.hit_light"]
            self.assertTrue(
                cue["path"].startswith(
                    f"res://assets/audio/{spec['bundleId']}/"
                )
            )
            provenance = json.loads(
                (bundle / "source/provenance.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(provenance["generator"]["ffmpegMajor"], 8)
            self.assertEqual(len(provenance["sourceRecords"]), 6)
            self.assertTrue(
                all(
                    record["licenseUrl"].startswith("https://")
                    for record in provenance["sourceRecords"]
                )
            )
            ledger = {
                item["assetId"]: item for item in provenance["ledger"]
            }
            self.assertEqual(
                ledger["test_hit_light_asset"]["sourceIds"],
                ["test_impact_0", "test_impact_1"],
            )
            self.assertIn(
                "amix=inputs=2",
                ledger["test_hit_light_asset"]["processingCommand"],
            )
            self.assertIn(
                "afade=t=in:st=0:d=0.003",
                ledger["test_hit_light_asset"]["processingCommand"],
            )
            self.assertIn(
                "afade=t=in:st=0:d=0.040",
                ledger["test_hit_light_asset"]["processingCommand"],
            )
            report = AUDIT.audit_bundle(
                bundle,
                write_report=False,
                project_root=root,
            )
            self.assertEqual(report["status"], "pass", report["failures"])
            repeated_bundle, _repeated_spec = self._prepare_layered_bundle(
                root / "repeated"
            )
            repeated_provenance = json.loads(
                (repeated_bundle / "source/provenance.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(
                {
                    item["runtimePath"]: item["runtimeSha256"]
                    for item in provenance["ledger"]
                },
                {
                    item["runtimePath"]: item["runtimeSha256"]
                    for item in repeated_provenance["ledger"]
                },
            )
            self.assertEqual(
                (bundle / "audio-cues.json").read_bytes(),
                (repeated_bundle / "audio-cues.json").read_bytes(),
            )

    @unittest.skipUnless(shutil.which("ffmpeg"), "FFmpeg is unavailable")
    def test_layered_auditor_rejects_changed_source(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bundle, _spec = self._prepare_layered_bundle(root)
            source = bundle / "source/vendor/test_impact_0.wav"
            source.write_bytes(source.read_bytes() + b"changed")
            report = AUDIT.audit_bundle(
                bundle,
                write_report=False,
                project_root=root,
            )
            failure_codes = {failure["code"] for failure in report["failures"]}
            self.assertIn("source_hash_mismatch", failure_codes)
            self.assertIn("source_expected_hash", failure_codes)

    @unittest.skipUnless(shutil.which("ffmpeg"), "FFmpeg is unavailable")
    def test_layered_auditor_rejects_unused_source(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bundle, spec = self._prepare_layered_bundle(root)
            unused_path = bundle / "source/vendor/test_unused.wav"
            _write_sine_wav(
                unused_path,
                frequency=180.0,
                duration_seconds=0.25,
                channels=1,
            )
            source_hash = _sha256_file(unused_path)
            unused_spec = {
                "author": "Beastbound test fixture",
                "expectedSha256": source_hash,
                "licenseName": "CC0-1.0",
                "licenseUrl": (
                    "https://creativecommons.org/publicdomain/zero/1.0/"
                ),
                "sourceId": "test_unused",
                "sourcePageUrl": "https://example.invalid/test-unused",
                "sourcePath": "source/vendor/test_unused.wav",
                "sourceType": "licensed_cc0",
            }
            spec["sources"].append(unused_spec)
            (bundle / "source/spec.json").write_text(
                json.dumps(spec, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            provenance_path = bundle / "source/provenance.json"
            provenance = json.loads(
                provenance_path.read_text(encoding="utf-8")
            )
            provenance["sourceSpecificationSha256"] = _sha256_file(
                bundle / "source/spec.json"
            )
            provenance["sourceRecords"].append(
                {
                    **unused_spec,
                    "pathKind": "bundle",
                    "sourceSha256": source_hash,
                }
            )
            provenance_path.write_text(
                json.dumps(
                    provenance,
                    ensure_ascii=False,
                    indent=2,
                    sort_keys=True,
                )
                + "\n",
                encoding="utf-8",
            )

            report = AUDIT.audit_bundle(
                bundle,
                write_report=False,
                project_root=root,
            )
            failure_codes = {failure["code"] for failure in report["failures"]}
            self.assertIn("unused_source", failure_codes)


if __name__ == "__main__":
    unittest.main()
