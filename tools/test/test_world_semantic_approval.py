#!/usr/bin/env python3
"""Isolated tests for tools/world_semantic_approval.py."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL = REPO_ROOT / "tools" / "world_semantic_approval.py"
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
ACTIONS = {"idle": 1, "walk": 4}
FORM_ID = "fixture_form"
RUN_ID = "fixture-run-001"
CHARACTER_ROOT = Path("assets/characters/fixture")
PET_ROOT = Path("assets/pets/fixture")
MOUNTED_ROOT = Path("assets/mounted/fixture")
CONTACT_SAMPLES = [
    frame
    for direction_index in range(8)
    for frame in (direction_index * 54 + 9, direction_index * 54 + 36)
]
FORM_EVIDENCE_FILENAMES = {
    "contact-decode.log",
    "contact.log",
    "ffprobe.json",
    "grid-decode.log",
    "grid-parity.json",
    "grid.log",
    "grid.png",
    "preflight-parity.json",
    "preflight-parity.log",
    "recording-parity.json",
    "recording.log",
    "review-contact-sheet.png",
    "review.avi",
    "review.mp4",
    "transcode.log",
    "video-decode.log",
}


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _file_record(repo_root: Path, path: Path, **extra: Any) -> dict[str, Any]:
    record = {
        "path": path.relative_to(repo_root).as_posix(),
        "sha256": _sha256(path),
        "sizeBytes": path.stat().st_size,
    }
    record.update(extra)
    return record


def _materialize_world(root: Path, *, salt: str) -> None:
    for direction in DIRECTIONS:
        for action, count in ACTIONS.items():
            for index in range(1, count + 1):
                path = root / "world" / "directions" / direction / action / f"{action}-{index}.png"
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(f"fixture:{salt}:{direction}:{action}:{index}\n".encode())


def _materialize_parity(repo_root: Path, path: Path) -> dict[str, Any]:
    roots = {
        "character": CHARACTER_ROOT,
        "pet": PET_ROOT,
        "mounted": MOUNTED_ROOT,
    }
    frames: list[dict[str, Any]] = []
    source_set_lines: list[str] = []
    for direction in DIRECTIONS:
        for action, count in ACTIONS.items():
            for index in range(1, count + 1):
                for kind in ("character", "pet", "mounted"):
                    relative = roots[kind] / "world" / "directions" / direction / action / f"{action}-{index}.png"
                    source = repo_root / relative
                    source_hash = _sha256(source)
                    source_md5 = hashlib.md5(source.read_bytes(), usedforsecurity=False).hexdigest()
                    decoded_hash = hashlib.sha256(b"decoded:" + source.read_bytes()).hexdigest()
                    runtime_path = f"res://{relative.as_posix()}"
                    frame = {
                        "kind": kind,
                        "path": runtime_path,
                        "direction": direction,
                        "action": action,
                        "index": index,
                        "status": "passed",
                        "errors": [],
                        "sourceFileSha256": source_hash,
                        "sourceFileMd5": source_md5,
                        "importSourceMd5": source_md5,
                        "importFresh": True,
                        "loadMode": "godot_import",
                        "sourceDecodedRgbaSha256": decoded_hash,
                        "loadedDecodedRgbaSha256": decoded_hash,
                        "canonicalRgbaMatch": True,
                    }
                    frames.append(frame)
                    source_set_lines.append(
                        f"{kind}\t{runtime_path}\t{source_hash}\t{decoded_hash}\t{decoded_hash}\n"
                    )
    source_set_hash = hashlib.sha256("".join(source_set_lines).encode()).hexdigest()
    _write_json(
        path,
        {
            "schemaVersion": 1,
            "formId": FORM_ID,
            "runId": RUN_ID,
            "status": "passed",
            "checkedFrames": 120,
            "passedFrames": 120,
            "sourceSetSha256": source_set_hash,
            "errors": [],
            "canonicalPartialRgb": "rgb_zeroed_where_alpha_below_255_before_rgba_hash",
            "frames": frames,
        },
    )
    return _file_record(
        repo_root,
        path,
        status="passed",
        checkedFrames=120,
        passedFrames=120,
        expectedFrames=120,
        sourceSetSha256=source_set_hash,
    )


def _materialize_evidence(repo_root: Path) -> Path:
    run_root = repo_root / "evidence" / RUN_ID
    form_root = run_root / FORM_ID
    form_root.mkdir(parents=True, exist_ok=True)
    preflight_parity = _materialize_parity(repo_root, form_root / "preflight-parity.json")
    recording_parity = _materialize_parity(repo_root, form_root / "recording-parity.json")
    grid_parity = _materialize_parity(repo_root, form_root / "grid-parity.json")

    video_path = form_root / "review.mp4"
    grid_path = form_root / "grid.png"
    contact_path = form_root / "review-contact-sheet.png"
    probe_path = form_root / "ffprobe.json"
    movie_path = form_root / "review.avi"
    video_path.write_bytes(b"fixture mp4 evidence\n")
    grid_path.write_bytes(b"fixture grid png\n")
    contact_path.write_bytes(b"fixture contact png\n")
    movie_path.write_bytes(b"fixture avi evidence\n")
    _write_json(
        probe_path,
        {
            "streams": [
                {
                    "index": 0,
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 1280,
                    "height": 720,
                    "r_frame_rate": "30/1",
                    "avg_frame_rate": "30/1",
                    "nb_frames": "433",
                    "nb_read_frames": "433",
                    "duration": "14.433333",
                }
            ],
            "format": {
                "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
                "duration": "14.433333",
                "size": str(video_path.stat().st_size),
            },
        },
    )

    video = _file_record(
        repo_root,
        video_path,
        codec="h264",
        width=1280,
        height=720,
        fps=30.0,
        durationSeconds=14.433,
        frameCount=433,
        expectedDurationSeconds=14.4,
        expectedEncodedDurationSeconds=433 / 30,
        expectedFrameCount=433,
        decodeStatus="passed",
    )
    grid = _file_record(repo_root, grid_path, width=1280, height=720, decodeStatus="passed")
    contact = _file_record(
        repo_root,
        contact_path,
        width=1280,
        height=2880,
        sampleFrameIndices=CONTACT_SAMPLES,
        sampleContract="per_direction_idle_at_0.30s_then_walk_at_1.20s",
        decodeStatus="passed",
    )
    probe = _file_record(repo_root, probe_path)
    movie = _file_record(repo_root, movie_path)
    for filename in sorted(
        FORM_EVIDENCE_FILENAMES
        - {
            "ffprobe.json",
            "grid-parity.json",
            "grid.png",
            "preflight-parity.json",
            "recording-parity.json",
            "review-contact-sheet.png",
            "review.avi",
            "review.mp4",
        }
    ):
        (form_root / filename).write_text(f"fixture {filename}\n", encoding="utf-8")
    records = [
        _file_record(repo_root, child)
        for child in sorted(form_root.iterdir(), key=lambda value: value.name)
    ]
    form = {
        "formId": FORM_ID,
        "runId": RUN_ID,
        "status": "passed",
        "preflightParity": preflight_parity,
        "parity": recording_parity,
        "gridParity": grid_parity,
        "video": video,
        "grid": grid,
        "contact": contact,
        "probe": probe,
        "movieArchive": movie,
        "files": records,
    }
    audit_directions = []
    for direction in DIRECTIONS:
        audit_directions.append(
            {
                "expectedDirection": direction,
                "result": "pass",
                "columns": {
                    "character": {
                        "pass": True,
                        "actualDirection": direction,
                        "idleWalkAxisStable": True,
                    },
                    "pet": {
                        "pass": True,
                        "actualDirection": direction,
                        "idleWalkAxisStable": True,
                    },
                    "mounted": {
                        "pass": True,
                        "actualDirection": direction,
                        "idleWalkAxisStable": True,
                        "riderMountCoAxis": True,
                    },
                },
            }
        )
    _write_json(
        run_root / "blind-audit.json",
        {
            "schemaVersion": 1,
            "auditId": "fixture-blind-audit",
            "runId": RUN_ID,
            "result": "pass",
            "summary": {"formsReviewed": 1},
            "forms": [
                {
                    "formId": FORM_ID,
                    "result": "pass",
                    "flags": [],
                    "evidence": {
                        "video": f"{FORM_ID}/review.mp4",
                        "contactSheet": f"{FORM_ID}/review-contact-sheet.png",
                    },
                    "videoIntegrity": {
                        "decodedCompletely": True,
                        "frameCount": 433,
                        "fps": 30,
                        "durationSeconds": 14.433333,
                        "decodeErrors": 0,
                    },
                    "directions": audit_directions,
                }
            ],
        },
    )
    import_log = run_root / "godot-import.log"
    import_log.write_text("fixture godot import passed\n", encoding="utf-8")
    all_records = [_file_record(repo_root, import_log), *records]
    all_records.sort(key=lambda record: record["path"])
    evidence_index_path = run_root / "evidence-index.json"
    _write_json(
        evidence_index_path,
        {
            "schemaVersion": 1,
            "indexType": "beastbound_world_direction_review_evidence",
            "runId": RUN_ID,
            "status": "passed",
            "scene": "res://scenes/qa/CharacterMountDirectionReview.tscn",
            "formIds": [FORM_ID],
            "expected": {
                "parityFramesPerForm": 120,
                "width": 1280,
                "height": 720,
                "fps": 30.0,
                "sceneDurationSeconds": 14.4,
                "encodedDurationSeconds": 433 / 30,
                "encodedFrameCount": 433,
            },
            "tools": {
                "godot": "4.7.fixture",
                "ffmpeg": "ffmpeg fixture",
                "ffprobe": "ffprobe fixture",
                "python": "python fixture",
            },
            "importLog": _file_record(repo_root, import_log),
            "forms": [form],
            "files": all_records,
            "indexedFileCount": len(all_records),
            "indexSelfHashExcluded": True,
        },
    )
    return evidence_index_path


def _materialize_fixture(repo_root: Path) -> tuple[Path, Path, Path]:
    catalog_path = repo_root / "catalog.json"
    manifest_path = repo_root / "approval.json"
    _write_json(
        catalog_path,
        {
            "defaultCharacterId": "fixture_character_v1",
            "forms": [
                {
                    "formId": FORM_ID,
                    "pet": {"root": PET_ROOT.as_posix()},
                    "mounted": {"root": MOUNTED_ROOT.as_posix()},
                }
            ],
        },
    )
    _materialize_world(repo_root / CHARACTER_ROOT, salt="character")
    _materialize_world(repo_root / PET_ROOT, salt="pet")
    _materialize_world(repo_root / MOUNTED_ROOT, salt="mounted")
    return catalog_path, manifest_path, _materialize_evidence(repo_root)


def _create_command(
    repo_root: Path,
    catalog_path: Path,
    manifest_path: Path,
    evidence_index_path: Path,
) -> list[str]:
    return [
        sys.executable,
        str(TOOL),
        "create",
        "--repo-root",
        str(repo_root),
        "--catalog",
        str(catalog_path),
        "--character-root",
        CHARACTER_ROOT.as_posix(),
        "--manifest",
        str(manifest_path),
        "--form-id",
        FORM_ID,
        "--reviewer",
        "fixture visual reviewer",
        "--evidence-index",
        str(evidence_index_path),
        "--audit-report",
        str(evidence_index_path.parent / "blind-audit.json"),
    ]


def _verify(
    repo_root: Path,
    catalog_path: Path,
    manifest_path: Path,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            str(TOOL),
            "verify",
            "--repo-root",
            str(repo_root),
            "--manifest",
            str(manifest_path),
            "--catalog",
            str(catalog_path),
            "--character-root",
            CHARACTER_ROOT.as_posix(),
            "--form-id",
            FORM_ID,
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )


def _refresh_index_path_record(repo_root: Path, evidence_index_path: Path, changed_path: Path) -> None:
    evidence_index = json.loads(evidence_index_path.read_text(encoding="utf-8"))
    form = evidence_index["forms"][0]
    relative = changed_path.relative_to(repo_root).as_posix()
    refreshed = _file_record(repo_root, changed_path)
    for key in ("preflightParity", "parity", "gridParity", "video", "grid", "contact", "probe"):
        if form[key]["path"] == relative:
            form[key].update(refreshed)
    for record in form["files"]:
        if record["path"] == relative:
            record.update(refreshed)
    for record in evidence_index["files"]:
        if record["path"] == relative:
            record.update(refreshed)
    _write_json(evidence_index_path, evidence_index)


class WorldSemanticApprovalTest(unittest.TestCase):
    def test_create_requires_explicit_visual_review_confirmation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path, evidence_index_path = _materialize_fixture(root)
            completed = subprocess.run(
                _create_command(root, catalog_path, manifest_path, evidence_index_path),
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )

            self.assertEqual(completed.returncode, 1)
            self.assertIn("--confirm-visual-direction-review", completed.stderr)
            self.assertFalse(manifest_path.exists())

    def test_confirmed_v2_manifest_freezes_sources_and_runtime_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path, evidence_index_path = _materialize_fixture(root)
            completed = subprocess.run(
                _create_command(root, catalog_path, manifest_path, evidence_index_path)
                + ["--confirm-visual-direction-review"],
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(manifest["schemaVersion"], 2)
            self.assertEqual(manifest["semanticDirectionReview"], "passed_by_visual_audit")
            self.assertEqual(manifest["ownerReview"], "pending")
            self.assertFalse(manifest["automaticDirectionRecognition"])
            self.assertEqual(manifest["bundleCount"], 3)
            self.assertEqual(manifest["frameCount"], 120)
            self.assertEqual(manifest["evidenceFileCount"], 18)
            self.assertEqual(manifest["evidenceAudit"]["snapshot"]["runId"], RUN_ID)

            verified = _verify(root, catalog_path, manifest_path)
            self.assertEqual(verified.returncode, 0, verified.stdout + verified.stderr)
            report = json.loads(verified.stdout)
            self.assertEqual(report["status"], "ok")
            self.assertEqual(report["checkedFrames"], 120)
            self.assertEqual(report["checkedEvidenceFiles"], 18)

    def test_modified_reviewed_frame_fails_hash_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path, evidence_index_path = _materialize_fixture(root)
            created = subprocess.run(
                _create_command(root, catalog_path, manifest_path, evidence_index_path)
                + ["--confirm-visual-direction-review"],
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(created.returncode, 0, created.stderr)
            changed = root / MOUNTED_ROOT / "world/directions/northwest/walk/walk-3.png"
            changed.write_bytes(changed.read_bytes() + b"drift")

            verified = _verify(root, catalog_path, manifest_path)
            self.assertEqual(verified.returncode, 1)
            report = json.loads(verified.stdout)
            self.assertEqual(report["status"], "failed")
            self.assertTrue(any("帧哈希漂移" in error for error in report["errors"]))

    def test_modified_evidence_file_fails_hash_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path, evidence_index_path = _materialize_fixture(root)
            created = subprocess.run(
                _create_command(root, catalog_path, manifest_path, evidence_index_path)
                + ["--confirm-visual-direction-review"],
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(created.returncode, 0, created.stderr)
            video_path = root / "evidence" / RUN_ID / FORM_ID / "review.mp4"
            video_path.write_bytes(video_path.read_bytes() + b"drift")

            verified = _verify(root, catalog_path, manifest_path)
            self.assertEqual(verified.returncode, 1)
            report = json.loads(verified.stdout)
            self.assertTrue(any("证据哈希漂移" in error for error in report["errors"]))

    def test_modified_evidence_index_fails_manifest_index_hash_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path, evidence_index_path = _materialize_fixture(root)
            created = subprocess.run(
                _create_command(root, catalog_path, manifest_path, evidence_index_path)
                + ["--confirm-visual-direction-review"],
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(created.returncode, 0, created.stderr)
            evidence_index_path.write_bytes(evidence_index_path.read_bytes() + b"\n")

            verified = _verify(root, catalog_path, manifest_path)
            self.assertEqual(verified.returncode, 1)
            report = json.loads(verified.stdout)
            self.assertTrue(any("证据哈希漂移" in error for error in report["errors"]))

    def test_modified_blind_audit_report_fails_hash_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path, evidence_index_path = _materialize_fixture(root)
            created = subprocess.run(
                _create_command(root, catalog_path, manifest_path, evidence_index_path)
                + ["--confirm-visual-direction-review"],
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(created.returncode, 0, created.stderr)
            audit_path = evidence_index_path.parent / "blind-audit.json"
            audit_path.write_bytes(audit_path.read_bytes() + b"drift")

            verified = _verify(root, catalog_path, manifest_path)
            self.assertEqual(verified.returncode, 1)
            report = json.loads(verified.stdout)
            self.assertTrue(any("证据哈希漂移" in error for error in report["errors"]))

    def test_create_rejects_parity_report_that_is_not_120_of_120_passed(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path, evidence_index_path = _materialize_fixture(root)
            parity_path = root / "evidence" / RUN_ID / FORM_ID / "recording-parity.json"
            parity = json.loads(parity_path.read_text(encoding="utf-8"))
            parity["passedFrames"] = 119
            parity["frames"][-1]["status"] = "failed"
            _write_json(parity_path, parity)
            _refresh_index_path_record(root, evidence_index_path, parity_path)

            completed = subprocess.run(
                _create_command(root, catalog_path, manifest_path, evidence_index_path)
                + ["--confirm-visual-direction-review"],
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(completed.returncode, 1)
            self.assertIn("passedFrames", completed.stderr)
            self.assertFalse(manifest_path.exists())

    def test_create_rejects_parity_form_run_binding_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path, evidence_index_path = _materialize_fixture(root)
            parity_path = root / "evidence" / RUN_ID / FORM_ID / "grid-parity.json"
            parity = json.loads(parity_path.read_text(encoding="utf-8"))
            parity["runId"] = "wrong-run"
            _write_json(parity_path, parity)
            _refresh_index_path_record(root, evidence_index_path, parity_path)

            completed = subprocess.run(
                _create_command(root, catalog_path, manifest_path, evidence_index_path)
                + ["--confirm-visual-direction-review"],
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(completed.returncode, 1)
            self.assertIn("runId", completed.stderr)

    def test_create_rejects_aliased_parity_evidence_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path, evidence_index_path = _materialize_fixture(root)
            evidence_index = json.loads(evidence_index_path.read_text(encoding="utf-8"))
            form = evidence_index["forms"][0]
            form["preflightParity"] = dict(form["parity"])
            form["gridParity"] = dict(form["parity"])
            _write_json(evidence_index_path, evidence_index)

            completed = subprocess.run(
                _create_command(root, catalog_path, manifest_path, evidence_index_path)
                + ["--confirm-visual-direction-review"],
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(completed.returncode, 1)
            self.assertIn("互不重复", completed.stderr)
            self.assertFalse(manifest_path.exists())

    def test_create_rejects_swapped_parity_evidence_filenames(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path, evidence_index_path = _materialize_fixture(root)
            evidence_index = json.loads(evidence_index_path.read_text(encoding="utf-8"))
            form = evidence_index["forms"][0]
            form["preflightParity"], form["gridParity"] = (
                form["gridParity"],
                form["preflightParity"],
            )
            _write_json(evidence_index_path, evidence_index)

            completed = subprocess.run(
                _create_command(root, catalog_path, manifest_path, evidence_index_path)
                + ["--confirm-visual-direction-review"],
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(completed.returncode, 1)
            self.assertIn("preflight-parity.json", completed.stderr)
            self.assertFalse(manifest_path.exists())

    def test_create_rejects_noncanonical_media_grid_contact_and_probe_contract(self) -> None:
        for case in ("video", "grid", "contact", "probe"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temp_dir:
                root = Path(temp_dir)
                catalog_path, manifest_path, evidence_index_path = _materialize_fixture(root)
                evidence_index = json.loads(evidence_index_path.read_text(encoding="utf-8"))
                form = evidence_index["forms"][0]
                if case == "video":
                    form["video"]["frameCount"] = 1
                elif case == "grid":
                    form["grid"]["height"] = 1
                elif case == "contact":
                    form["contact"]["sampleFrameIndices"] = CONTACT_SAMPLES[:-1]
                else:
                    probe_path = root / "evidence" / RUN_ID / FORM_ID / "ffprobe.json"
                    probe = json.loads(probe_path.read_text(encoding="utf-8"))
                    probe["streams"][0]["codec_name"] = "not-h264"
                    _write_json(probe_path, probe)
                    _write_json(evidence_index_path, evidence_index)
                    _refresh_index_path_record(root, evidence_index_path, probe_path)
                    evidence_index = None
                if evidence_index is not None:
                    _write_json(evidence_index_path, evidence_index)

                completed = subprocess.run(
                    _create_command(root, catalog_path, manifest_path, evidence_index_path)
                    + ["--confirm-visual-direction-review"],
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                self.assertEqual(completed.returncode, 1, completed.stdout)
                self.assertFalse(manifest_path.exists())

    def test_create_rejects_duplicate_or_unidentified_parity_frame_coverage(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path, evidence_index_path = _materialize_fixture(root)
            parity_path = root / "evidence" / RUN_ID / FORM_ID / "recording-parity.json"
            parity = json.loads(parity_path.read_text(encoding="utf-8"))
            parity["frames"][0] = dict(parity["frames"][1])
            _write_json(parity_path, parity)
            _refresh_index_path_record(root, evidence_index_path, parity_path)

            completed = subprocess.run(
                _create_command(root, catalog_path, manifest_path, evidence_index_path)
                + ["--confirm-visual-direction-review"],
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(completed.returncode, 1)
            self.assertIn("frames", completed.stderr)
            self.assertFalse(manifest_path.exists())

    def test_create_rejects_unbound_or_incomplete_blind_audit(self) -> None:
        for case in ("wrong-evidence", "flagged", "missing-direction", "decode-failed"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temp_dir:
                root = Path(temp_dir)
                catalog_path, manifest_path, evidence_index_path = _materialize_fixture(root)
                audit_path = evidence_index_path.parent / "blind-audit.json"
                audit = json.loads(audit_path.read_text(encoding="utf-8"))
                form = audit["forms"][0]
                if case == "wrong-evidence":
                    form["evidence"]["video"] = f"{FORM_ID}/other.mp4"
                elif case == "flagged":
                    form["flags"] = ["north ambiguous"]
                elif case == "missing-direction":
                    form["directions"].pop()
                else:
                    form["videoIntegrity"]["decodedCompletely"] = False
                _write_json(audit_path, audit)

                completed = subprocess.run(
                    _create_command(root, catalog_path, manifest_path, evidence_index_path)
                    + ["--confirm-visual-direction-review"],
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                self.assertEqual(completed.returncode, 1, completed.stdout)
                self.assertFalse(manifest_path.exists())

    def test_create_rejects_incomplete_top_level_evidence_inventory(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path, evidence_index_path = _materialize_fixture(root)
            evidence_index = json.loads(evidence_index_path.read_text(encoding="utf-8"))
            import_path = evidence_index["importLog"]["path"]
            evidence_index["files"] = [
                record for record in evidence_index["files"] if record["path"] != import_path
            ]
            evidence_index["indexedFileCount"] = len(evidence_index["files"])
            _write_json(evidence_index_path, evidence_index)

            completed = subprocess.run(
                _create_command(root, catalog_path, manifest_path, evidence_index_path)
                + ["--confirm-visual-direction-review"],
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(completed.returncode, 1)
            self.assertIn("importLog", completed.stderr)
            self.assertFalse(manifest_path.exists())

    def test_extra_world_png_fails_exact_collection_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path, evidence_index_path = _materialize_fixture(root)
            created = subprocess.run(
                _create_command(root, catalog_path, manifest_path, evidence_index_path)
                + ["--confirm-visual-direction-review"],
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(created.returncode, 0, created.stderr)
            extra = root / PET_ROOT / "world/directions/north/walk/walk-5.png"
            extra.write_bytes(b"unapproved extra frame\n")

            verified = _verify(root, catalog_path, manifest_path)
            self.assertEqual(verified.returncode, 1)
            report = json.loads(verified.stdout)
            self.assertTrue(any("规范外 world PNG" in error for error in report["errors"]))

    def test_manifest_cannot_claim_automatic_direction_recognition(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path, evidence_index_path = _materialize_fixture(root)
            created = subprocess.run(
                _create_command(root, catalog_path, manifest_path, evidence_index_path)
                + ["--confirm-visual-direction-review"],
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(created.returncode, 0, created.stderr)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["automaticDirectionRecognition"] = True
            _write_json(manifest_path, manifest)

            verified = _verify(root, catalog_path, manifest_path)
            self.assertEqual(verified.returncode, 1)
            report = json.loads(verified.stdout)
            self.assertTrue(any("automaticDirectionRecognition" in error for error in report["errors"]))

    def test_legacy_v1_manifest_is_auditable_but_never_current_pass(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            catalog_path, manifest_path, evidence_index_path = _materialize_fixture(root)
            created = subprocess.run(
                _create_command(root, catalog_path, manifest_path, evidence_index_path)
                + ["--confirm-visual-direction-review"],
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(created.returncode, 0, created.stderr)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["schemaVersion"] = 1
            manifest["reviewStatement"] = (
                "Direction semantics were judged by visual audit; automation only freezes "
                "the reviewed paths and file hashes."
            )
            manifest["visualAudit"] = {
                "reviewer": "legacy fixture reviewer",
                "evidence": ["evidence/legacy-review"],
            }
            manifest.pop("evidenceAudit")
            manifest.pop("evidenceFileCount")
            _write_json(manifest_path, manifest)

            verified = _verify(root, catalog_path, manifest_path)
            self.assertEqual(verified.returncode, 1)
            report = json.loads(verified.stdout)
            self.assertEqual(report["status"], "legacy_manifest_not_current")
            self.assertEqual(report["checkedFrames"], 120)
            self.assertTrue(any("不能作为当前通过结论" in error for error in report["errors"]))


if __name__ == "__main__":
    unittest.main()
