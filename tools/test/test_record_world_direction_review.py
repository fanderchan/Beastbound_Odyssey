#!/usr/bin/env python3
"""Focused contract tests for tools/record_world_direction_review.py."""

from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools" / "record_world_direction_review.py"
SPEC = importlib.util.spec_from_file_location("record_world_direction_review", TOOL_PATH)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def _parity_report(*, form_id: str = "fixture_form", run_id: str = "fixture-run") -> dict:
    frames = []
    for direction in TOOL.PARITY_DIRECTIONS:
        for action, frame_index in TOOL.PARITY_ACTION_FRAMES:
            for kind in TOOL.PARITY_KINDS:
                ordinal = len(frames)
                frames.append(
                    {
                        "kind": kind,
                        "path": (
                            f"res://fixtures/{kind}/world/directions/{direction}/"
                            f"{action}/{action}-{frame_index}.png"
                        ),
                        "direction": direction,
                        "action": action,
                        "index": frame_index,
                        "status": "passed",
                        "errors": [],
                        "importFresh": True,
                        "loadMode": "godot_import",
                        "canonicalRgbaMatch": True,
                        "sourceFileSha256": hashlib.sha256(
                            f"source-file-{ordinal}".encode()
                        ).hexdigest(),
                        "sourceDecodedRgbaSha256": hashlib.sha256(
                            f"source-rgba-{ordinal}".encode()
                        ).hexdigest(),
                        "loadedDecodedRgbaSha256": hashlib.sha256(
                            f"loaded-rgba-{ordinal}".encode()
                        ).hexdigest(),
                    }
                )
    report = {
        "schemaVersion": 1,
        "runId": run_id,
        "formId": form_id,
        "status": "passed",
        "checkedFrames": 120,
        "passedFrames": 120,
        "errors": [],
        "frames": frames,
    }
    report["sourceSetSha256"] = TOOL._parity_source_set_sha256(frames)
    return report


def _probe(*, frame_count: int = 433, duration: str = "14.433333") -> dict:
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


class RecordWorldDirectionReviewTest(unittest.TestCase):
    def test_parity_report_requires_same_form_run_and_all_120_frames(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "parity.json"
            path.write_text(json.dumps(_parity_report()), encoding="utf-8")
            report = TOOL._validate_parity_report(
                path,
                form_id="fixture_form",
                run_id="fixture-run",
                label="fixture parity",
            )
            self.assertEqual(report["checkedFrames"], 120)

            changed = _parity_report(run_id="other-run")
            path.write_text(json.dumps(changed), encoding="utf-8")
            with self.assertRaisesRegex(TOOL.ReviewRecordingError, "runId"):
                TOOL._validate_parity_report(
                    path,
                    form_id="fixture_form",
                    run_id="fixture-run",
                    label="fixture parity",
                )

    def test_parity_report_rejects_source_set_drift_between_processes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "parity.json"
            path.write_text(json.dumps(_parity_report()), encoding="utf-8")
            with self.assertRaisesRegex(TOOL.ReviewRecordingError, "漂移"):
                TOOL._validate_parity_report(
                    path,
                    form_id="fixture_form",
                    run_id="fixture-run",
                    label="recording parity",
                    expected_source_set_sha256="b" * 64,
                )

    def test_parity_report_rejects_schema_drift(self) -> None:
        report = _parity_report()
        report["schemaVersion"] = 2
        self._assert_parity_rejected(report, "schemaVersion")

    def test_parity_report_rejects_duplicate_logical_row(self) -> None:
        report = _parity_report()
        report["frames"][-1] = copy.deepcopy(report["frames"][0])
        report["sourceSetSha256"] = TOOL._parity_source_set_sha256(report["frames"])
        self._assert_parity_rejected(report, "重复逻辑帧")

    def test_parity_report_rejects_non_godot_import_load_mode(self) -> None:
        report = _parity_report()
        report["frames"][0]["loadMode"] = "qa_direct_file"
        self._assert_parity_rejected(report, "loadMode")

    def test_parity_report_rejects_recomputed_source_set_hash_mismatch(self) -> None:
        report = _parity_report()
        report["sourceSetSha256"] = "b" * 64
        self._assert_parity_rejected(report, "重算")

    def test_parity_report_rejects_invalid_frame_sha_and_unsafe_path(self) -> None:
        report = _parity_report()
        report["frames"][0]["sourceFileSha256"] = "A" * 64
        report["frames"][1]["path"] = "res://fixtures/../escape.png"
        report["sourceSetSha256"] = TOOL._parity_source_set_sha256(report["frames"])
        self._assert_parity_rejected(report, "小写 SHA-256")
        with self.assertRaisesRegex(TOOL.ReviewRecordingError, "安全"):
            self._validate_parity(report)

    def _validate_parity(self, report: dict) -> dict:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "parity.json"
            path.write_text(json.dumps(report), encoding="utf-8")
            return TOOL._validate_parity_report(
                path,
                form_id="fixture_form",
                run_id="fixture-run",
                label="fixture parity",
            )

    def _assert_parity_rejected(self, report: dict, pattern: str) -> None:
        with self.assertRaisesRegex(TOOL.ReviewRecordingError, pattern):
            self._validate_parity(report)

    def test_probe_requires_fixed_1280x720_30fps_433_frame_contract(self) -> None:
        metadata = TOOL._validate_probe(_probe())
        self.assertEqual(metadata["frameCount"], 433)
        self.assertAlmostEqual(metadata["durationSeconds"], 14.433333)

        with self.assertRaisesRegex(TOOL.ReviewRecordingError, "frameCount"):
            TOOL._validate_probe(_probe(frame_count=432, duration="14.4"))

    def test_form_ids_are_safe_and_unique(self) -> None:
        self.assertEqual(TOOL._selected_forms(["a", "b"]), ("a", "b"))
        with self.assertRaisesRegex(TOOL.ReviewRecordingError, "不能重复"):
            TOOL._selected_forms(["a", "a"])
        with self.assertRaisesRegex(TOOL.ReviewRecordingError, "不安全"):
            TOOL._selected_forms(["../escape"])


if __name__ == "__main__":
    unittest.main()
