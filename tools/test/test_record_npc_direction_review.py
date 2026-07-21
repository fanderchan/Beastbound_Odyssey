#!/usr/bin/env python3
"""Focused contract tests for tools/record_npc_direction_review.py."""

from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools" / "record_npc_direction_review.py"
SPEC = importlib.util.spec_from_file_location("record_npc_direction_review", TOOL_PATH)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _parity_report(
    *,
    appearance_id: str = "npc_fixture_f_v1",
    run_id: str = "fixture-run",
    process_kind: str = "preflight",
) -> dict:
    frames = []
    coverage = [
        ("world", direction) for direction in TOOL.PARITY_DIRECTIONS
    ] + [("portrait", state) for state in TOOL.PORTRAIT_STATES]
    for ordinal, (kind, slot) in enumerate(coverage):
        if kind == "world":
            path = (
                f"res://assets/npcs/{appearance_id}/world/directions/{slot}/"
                "idle/idle-1.png"
            )
        else:
            path = f"res://assets/npcs/{appearance_id}/portrait/{slot}.png"
        source_rgba = hashlib.sha256(f"rgba-{ordinal}".encode()).hexdigest()
        frames.append(
            {
                "kind": kind,
                "slot": slot,
                "path": path,
                "status": "passed",
                "errors": [],
                "importFresh": True,
                "loadMode": "godot_import",
                "canonicalRgbaMatch": True,
                "sourceLoadedRgbaMatch": True,
                "fileSha256": hashlib.sha256(
                    f"file-{ordinal}".encode()
                ).hexdigest(),
                "sourceFullDecodedRgbaSha256": source_rgba,
                "sourceDecodedRgbaSha256": source_rgba,
                "loadedDecodedRgbaSha256": source_rgba,
            }
        )
    report = {
        "schemaVersion": 1,
        "reportType": TOOL.PARITY_TYPE,
        "runId": run_id,
        "appearanceId": appearance_id,
        "processKind": process_kind,
        "status": "passed",
        "checkedFrames": 12,
        "passedFrames": 12,
        "runtimeMirroring": False,
        "errors": [],
        "frames": frames,
    }
    report["sourceSetSha256"] = TOOL._parity_source_set_sha256(frames)
    return report


def _probe(*, frame_count: int = 361, duration: str = "12.033333") -> dict:
    return {
        "streams": [
            {
                "codec_type": "video",
                "codec_name": "h264",
                "width": 1280,
                "height": 720,
                "r_frame_rate": "30/1",
                "avg_frame_rate": "30/1",
                "nb_frames": str(frame_count),
                "nb_read_frames": str(frame_count),
                "duration": duration,
            }
        ],
        "format": {"duration": duration},
    }


class RecordNpcDirectionReviewTest(unittest.TestCase):
    def _validate_parity(self, report: dict, *, process_kind: str = "preflight") -> dict:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "parity.json"
            path.write_text(json.dumps(report), encoding="utf-8")
            return TOOL._validate_parity_report(
                path,
                appearance_id="npc_fixture_f_v1",
                run_id="fixture-run",
                process_kind=process_kind,
                label="fixture parity",
            )

    def _assert_parity_rejected(self, report: dict, pattern: str) -> None:
        with self.assertRaisesRegex(TOOL.NpcReviewRecordingError, pattern):
            self._validate_parity(report)

    def test_parity_report_requires_all_twelve_catalog_loaded_frames(self) -> None:
        report = self._validate_parity(_parity_report())
        self.assertEqual(report["checkedFrames"], 12)
        self.assertEqual(
            {
                (frame["kind"], frame["slot"])
                for frame in report["frames"]
            },
            TOOL.EXPECTED_PARITY_COVERAGE,
        )

    def test_parity_report_separates_full_source_from_canonical_loaded_hash(self) -> None:
        report = _parity_report()
        report["frames"][0]["sourceFullDecodedRgbaSha256"] = hashlib.sha256(
            b"partial-alpha-full-rgba"
        ).hexdigest()
        report["sourceSetSha256"] = TOOL._parity_source_set_sha256(
            report["frames"]
        )
        validated = self._validate_parity(report)
        self.assertNotEqual(
            validated["frames"][0]["sourceFullDecodedRgbaSha256"],
            validated["frames"][0]["sourceDecodedRgbaSha256"],
        )

        report["frames"][0]["sourceFullDecodedRgbaSha256"] = "bad"
        report["sourceSetSha256"] = TOOL._parity_source_set_sha256(
            report["frames"]
        )
        with self.assertRaisesRegex(
            TOOL.NpcReviewRecordingError, "sourceFullDecodedRgbaSha256"
        ):
            self._validate_parity(report)

    def test_parity_report_rejects_process_and_source_set_drift(self) -> None:
        report = _parity_report(process_kind="recording")
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "parity.json"
            path.write_text(json.dumps(report), encoding="utf-8")
            with self.assertRaisesRegex(TOOL.NpcReviewRecordingError, "漂移"):
                TOOL._validate_parity_report(
                    path,
                    appearance_id="npc_fixture_f_v1",
                    run_id="fixture-run",
                    process_kind="recording",
                    label="recording parity",
                    expected_source_set_sha256="b" * 64,
                )

    def test_parity_report_rejects_mirroring_or_loaded_rgba_mismatch(self) -> None:
        report = _parity_report()
        report["runtimeMirroring"] = True
        self._assert_parity_rejected(report, "runtimeMirroring")

        report = _parity_report()
        report["frames"][0]["sourceLoadedRgbaMatch"] = False
        self._assert_parity_rejected(report, "sourceLoadedRgbaMatch")

    def test_parity_report_rejects_duplicate_and_unsafe_paths(self) -> None:
        report = _parity_report()
        report["frames"][-1] = copy.deepcopy(report["frames"][0])
        report["sourceSetSha256"] = TOOL._parity_source_set_sha256(
            report["frames"]
        )
        self._assert_parity_rejected(report, "重复逻辑帧")

        report = _parity_report()
        report["frames"][0]["path"] = "res://assets/npcs/../escape.png"
        report["sourceSetSha256"] = TOOL._parity_source_set_sha256(
            report["frames"]
        )
        self._assert_parity_rejected(report, "安全")

    def test_parity_report_rejects_invalid_hash_and_recomputed_set(self) -> None:
        report = _parity_report()
        report["frames"][0]["fileSha256"] = "A" * 64
        report["sourceSetSha256"] = TOOL._parity_source_set_sha256(
            report["frames"]
        )
        self._assert_parity_rejected(report, "小写 SHA-256")

        report = _parity_report()
        report["sourceSetSha256"] = "b" * 64
        self._assert_parity_rejected(report, "重算")

    def test_probe_requires_h264_1280x720_30fps_and_361_frames(self) -> None:
        metadata = TOOL._validate_probe(_probe())
        self.assertEqual(metadata["frameCount"], 361)
        self.assertAlmostEqual(metadata["durationSeconds"], 12.033333)
        with self.assertRaisesRegex(TOOL.NpcReviewRecordingError, "frameCount"):
            TOOL._validate_probe(_probe(frame_count=360, duration="12.0"))

    def test_appearance_ids_are_explicit_safe_and_unique(self) -> None:
        self.assertEqual(
            TOOL._selected_appearances(["npc_a_f_v1", "npc_b_m_v1"]),
            ("npc_a_f_v1", "npc_b_m_v1"),
        )
        with self.assertRaisesRegex(TOOL.NpcReviewRecordingError, "不能重复"):
            TOOL._selected_appearances(["npc_a_f_v1", "npc_a_f_v1"])
        with self.assertRaisesRegex(TOOL.NpcReviewRecordingError, "不安全"):
            TOOL._selected_appearances(["../escape"])
        with self.assertRaisesRegex(TOOL.NpcReviewRecordingError, "至少需要"):
            TOOL._selected_appearances([])

    def test_all_candidates_reads_current_static_catalog_in_order(self) -> None:
        candidates = TOOL._catalog_candidate_ids()
        self.assertGreaterEqual(len(candidates), 8)
        self.assertEqual(len(candidates), len(set(candidates)))
        self.assertTrue(all(TOOL.SAFE_ID.fullmatch(value) for value in candidates))
        self.assertEqual(
            TOOL._selected_appearances(None, all_candidates=True), candidates
        )

    def test_contact_samples_are_mid_hold_for_all_eight_directions(self) -> None:
        self.assertEqual(
            TOOL.CONTACT_SAMPLE_FRAME_INDICES,
            (22, 67, 112, 157, 202, 247, 292, 337),
        )


if __name__ == "__main__":
    unittest.main()
