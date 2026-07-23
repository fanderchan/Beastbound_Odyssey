#!/usr/bin/env python3
"""Regression tests for the deterministic Beastbound audio pipeline."""

from __future__ import annotations

import importlib.util
import json
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


class AudioPipelineTest(unittest.TestCase):
    def _prepare_bundle(self, root: Path) -> Path:
        bundle = root / "beastbound_audio_v1"
        (bundle / "source").mkdir(parents=True)
        shutil.copy2(SPEC_PATH, bundle / "source/spec.json")
        SYNTH.build_bundle(bundle / "source/spec.json", bundle)
        return bundle

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


if __name__ == "__main__":
    unittest.main()
