from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "combine_npc_staged_review.py"
SPEC = importlib.util.spec_from_file_location("combine_npc_staged_review", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


class CombineNpcStagedReviewTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "Beastbound_Odyssey"
        self.root.mkdir()
        self.original_repo_root = TOOL.REPO_ROOT
        TOOL.REPO_ROOT = self.root
        self.addCleanup(setattr, TOOL, "REPO_ROOT", self.original_repo_root)
        self.appearance_id = "npc_fixture_keeper_m_v1"
        self.producer_id = "agent:npc-producer"
        self.reviewer_id = "agent:independent-reviewer"
        self.run_root = self.root / ".run" / "evidence" / "phase327" / self.appearance_id
        self.run_root.mkdir(parents=True)
        self.packet_path = self.run_root / "blind" / "reviewer-packet.json"
        self.mapping_path = self.run_root / "private" / "producer-mapping.json"
        self.stage_a_path = self.run_root / "staged-review" / "stage-a-result.json"
        self.stage_b_path = self.run_root / "staged-review" / "stage-b-observation.json"
        self.output_path = self.run_root / "final" / "blind-audit.json"
        self.action_meta_path = (
            self.root
            / "client"
            / "godot"
            / "assets"
            / "npcs"
            / self.appearance_id
            / "action-bundle-meta.json"
        )
        self._write_fixture()

    @staticmethod
    def _write_json(path: Path, value: object) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    @staticmethod
    def _hash_text(value: str) -> str:
        import hashlib

        return hashlib.sha256(value.encode("utf-8")).hexdigest()

    def _write_fixture(self) -> None:
        packet = {
            "schemaVersion": 1,
            "packetType": "beastbound_npc_blind_review_packet",
            "status": "prepared",
            "appearanceId": self.appearance_id,
            "producerId": self.producer_id,
        }
        self._write_json(self.packet_path, packet)
        packet_sha = TOOL._sha256(self.packet_path)
        directions = list(TOOL.DIRECTIONS)
        presentation: list[dict[str, object]] = []
        direction_results: list[dict[str, object]] = []
        for index in range(8):
            direction = directions[(index + 1) % 8]
            presentation.append(
                {
                    "presentationIndex": index,
                    "sourceRuntimePath": f"runtime/world/{direction}/idle-1.png",
                    "installedPath": f"world/directions/{direction}/idle/idle-1.png",
                }
            )
            direction_results.append(
                {
                    "presentationIndex": index,
                    "classifiedDirection": direction,
                    "status": "pass",
                    "visualObservation": f"第 {index} 张轮廓判定清楚",
                }
            )
        mapping = {
            "schemaVersion": 1,
            "mappingType": "beastbound_npc_blind_producer_mapping",
            "status": "prepared",
            "appearanceId": self.appearance_id,
            "producerId": self.producer_id,
            "reviewPacketSha256": packet_sha,
            "shuffleSeedSha256": self._hash_text("shuffle"),
            "presentation": presentation,
        }
        self._write_json(self.mapping_path, mapping)
        stage_a = {
            "schemaVersion": 1,
            "resultType": "beastbound_npc_blind_stage_a_result",
            "status": "frozen",
            "appearanceId": self.appearance_id,
            "reviewerId": self.reviewer_id,
            "reviewPacketSha256": packet_sha,
            "frozenAtUtc": "2026-07-22T01:00:00Z",
            "directionResults": direction_results,
        }
        self._write_json(self.stage_a_path, stage_a)
        stage_a_sha = TOOL._sha256(self.stage_a_path)
        installation_frames: list[dict[str, object]] = []
        for direction in directions:
            installation_frames.append(
                {
                    "kind": "world",
                    "slot": f"{direction}/idle/1",
                    "sourceRuntimePath": f"runtime/world/{direction}/idle-1.png",
                    "installedPath": f"world/directions/{direction}/idle/idle-1.png",
                    "fileSha256": self._hash_text(f"world-file-{direction}"),
                    "rgbaSha256": self._hash_text(f"world-rgba-{direction}"),
                }
            )
        portrait_inspections: list[dict[str, object]] = []
        for state in TOOL.PORTRAIT_STATES:
            artifact = self.run_root / "stage-b" / "portraits" / f"{self._hash_text(state)[:32]}.png"
            artifact.parent.mkdir(parents=True, exist_ok=True)
            artifact.write_bytes(f"portrait artifact {state}\n".encode())
            artifact_sha = TOOL._sha256(artifact)
            installation_frames.append(
                {
                    "kind": "portrait",
                    "slot": state,
                    "sourceRuntimePath": f"runtime/portraits/{state}.png",
                    "installedPath": f"portrait/{state}.png",
                    "fileSha256": artifact_sha,
                    "rgbaSha256": self._hash_text(f"portrait-rgba-{state}"),
                }
            )
            portrait_inspections.append(
                {
                    "state": state,
                    "reviewerArtifactPath": artifact.as_posix(),
                    "reviewerArtifactSha256": artifact_sha,
                    "status": "pass",
                    "visualObservation": f"{state} 人像身份与造型一致",
                }
            )
        screenshot = self.run_root / "stage-b" / "main" / "dialog.png"
        screenshot.parent.mkdir(parents=True, exist_ok=True)
        screenshot.write_bytes(b"main screenshot bytes\n")
        screenshot_sha = TOOL._sha256(screenshot)
        main_observations = [
            {
                "reviewerArtifactPath": screenshot.as_posix(),
                "reviewerArtifactSha256": screenshot_sha,
                "scene": "res://scenes/Main.tscn",
                "mapId": "firebud_village_gate",
                "npcId": "fixture_keeper",
                "appearanceId": self.appearance_id,
                "worldVisible": True,
                "portraitVisible": True,
                "status": "pass",
                "visualObservation": "Main 画面中的世界像与对话人像均清晰可见",
            }
        ]
        stage_b = {
            "schemaVersion": 1,
            "observationType": "beastbound_npc_blind_stage_b_observation",
            "status": "frozen",
            "appearanceId": self.appearance_id,
            "reviewerId": self.reviewer_id,
            "stageAResultSha256": stage_a_sha,
            "frozenAtUtc": "2026-07-22T01:01:00Z",
            "portraitInspections": portrait_inspections,
            "mainSceneObservations": main_observations,
        }
        self._write_json(self.stage_b_path, stage_b)
        review = {
            "runtimeEvidenceIndexSha256": self._hash_text("index"),
            "runtimeVideoSha256": self._hash_text("video"),
            "runtimeScreenshots": [screenshot.as_posix()],
            "runtimeScreenshotSha256s": [screenshot_sha],
            "blindReviewPacket": self.packet_path.as_posix(),
            "blindReviewPacketSha256": packet_sha,
            "blindProducerMapping": self.mapping_path.as_posix(),
            "blindProducerMappingSha256": TOOL._sha256(self.mapping_path),
            "blindStageAResult": self.stage_a_path.as_posix(),
            "blindStageAResultSha256": stage_a_sha,
            "blindStageBObservation": self.stage_b_path.as_posix(),
            "blindStageBObservationSha256": TOOL._sha256(self.stage_b_path),
        }
        metadata = {
            "appearanceId": self.appearance_id,
            "review": review,
            "installation": {"frames": installation_frames},
        }
        self._write_json(self.action_meta_path, metadata)

    def _combine(self) -> dict[str, object]:
        return TOOL.combine_staged_review(
            action_meta_path=self.action_meta_path,
            stage_a_path=self.stage_a_path,
            stage_b_path=self.stage_b_path,
            output_path=self.output_path,
            producer_id=self.producer_id,
            produced_at_utc="2026-07-22T01:02:00Z",
        )

    def _rewrite_stage_b(self, mutate) -> None:
        stage_b = json.loads(self.stage_b_path.read_text(encoding="utf-8"))
        mutate(stage_b)
        self._write_json(self.stage_b_path, stage_b)
        metadata = json.loads(self.action_meta_path.read_text(encoding="utf-8"))
        metadata["review"]["blindStageBObservationSha256"] = TOOL._sha256(
            self.stage_b_path
        )
        self._write_json(self.action_meta_path, metadata)

    def test_combines_without_rewriting_reviewer_originals(self) -> None:
        result = self._combine()
        audit = result["audit"]
        stage_a = json.loads(self.stage_a_path.read_text(encoding="utf-8"))
        stage_b = json.loads(self.stage_b_path.read_text(encoding="utf-8"))
        self.assertEqual(stage_a["directionResults"], audit["directionResults"])
        self.assertEqual(stage_b["portraitInspections"], audit["portraitInspections"])
        self.assertEqual(stage_b["mainSceneObservations"], audit["mainSceneObservations"])
        self.assertEqual(4, len(audit["portraitBindings"]))
        self.assertEqual(2, audit["schemaVersion"])
        self.assertEqual(TOOL._sha256(self.output_path), result["sha256"])

    def test_rejects_missing_stage_a_or_b(self) -> None:
        for path, fragment in (
            (self.stage_a_path, "Stage A original"),
            (self.stage_b_path, "Stage B original"),
        ):
            with self.subTest(path=path.name):
                saved = path.read_bytes()
                path.unlink()
                with self.assertRaisesRegex(TOOL.StagedReviewError, fragment):
                    self._combine()
                path.write_bytes(saved)

    def test_rejects_stage_hash_drift(self) -> None:
        self.stage_a_path.write_bytes(self.stage_a_path.read_bytes() + b" \n")
        with self.assertRaisesRegex(TOOL.StagedReviewError, "hash 漂移"):
            self._combine()

    def test_rejects_stage_b_private_or_direction_leak(self) -> None:
        def leak_private(stage_b: dict[str, object]) -> None:
            stage_b["privateMapping"] = {"0": "north"}

        self._rewrite_stage_b(leak_private)
        with self.assertRaisesRegex(TOOL.StagedReviewError, "字段集合无效"):
            self._combine()

        self._write_fixture()

        def leak_direction(stage_b: dict[str, object]) -> None:
            stage_b["portraitInspections"][0]["visualObservation"] = "明确答案 north"

        self._rewrite_stage_b(leak_direction)
        with self.assertRaisesRegex(TOOL.StagedReviewError, "泄露方向/private"):
            self._combine()

    def test_rejects_stage_order_reversal(self) -> None:
        def reverse(stage_b: dict[str, object]) -> None:
            stage_b["frozenAtUtc"] = "2026-07-22T00:59:00Z"

        self._rewrite_stage_b(reverse)
        with self.assertRaisesRegex(TOOL.StagedReviewError, "Stage A 后"):
            self._combine()

    def test_refuses_overwrite_of_tampered_merge(self) -> None:
        self.output_path.parent.mkdir(parents=True)
        self.output_path.write_text('{"tampered":true}\n', encoding="utf-8")
        with self.assertRaisesRegex(TOOL.StagedReviewError, "拒绝覆盖"):
            self._combine()

    def test_direction_token_boundaries_do_not_false_positive(self) -> None:
        safe_path = (
            self.root
            / ".run"
            / "evidence"
            / "stage-b"
            / "portraits"
            / "0123456789abcdef.png"
        )
        self.assertFalse(TOOL._artifact_path_leaks_stage_b_answer(safe_path))
        self.assertFalse(TOOL._text_leaks_stage_b_answer("at least one portrait is clear"))
        self.assertTrue(TOOL._text_leaks_stage_b_answer("answer: east"))
        self.assertTrue(
            TOOL._artifact_path_leaks_stage_b_answer(
                self.run_root / "stage-b" / "portraits" / "north.png"
            )
        )


if __name__ == "__main__":
    unittest.main()
