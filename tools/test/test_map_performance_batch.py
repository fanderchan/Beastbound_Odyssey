from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest

TOOLS = Path(__file__).resolve().parents[1]
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
import map_performance_batch as batch
import map_performance_batch_contract as contract
import map_visual_evidence_builder as builder
from test_map_visual_evidence_builder import _record_at_mean


def fixture_records() -> list[dict]:
    cases = [dict(zip(("mapId", "variant", "mode", "repetition"), values))
             for values in builder.expected_performance_matrix(["earth_vein_cave"], 3)]
    plan = {"strategy": contract.STRATEGY, "buildIdentity": "test-build",
            "mainScene": contract.MAIN_SCENE, "focusPolicy": "foreground_required_v1",
            "bundleId": "earth_vein_cave_visual_v1", "samples": cases,
            "sourceIdentity": contract.source_identity(TOOLS.parent)}
    plan_sha = contract.sha256(plan)
    completion = {"status": "passed", "planSha256": plan_sha,
                  "processId": 42, "rootWindowId": 0, "windowCount": 1,
                  "completedSamples": len(cases), "releasedMainCount": len(cases),
                  "remainingMainCount": 0, "errors": []}
    records = []
    for index, case in enumerate(cases):
        record = _record_at_mean(case["mapId"], case["variant"], case["mode"],
                                 case["repetition"], 0.2)
        start = {"planSha256": plan_sha, "sampleIndex": index, "sample": case,
                 "processId": 42, "rootWindowId": 0, "mainInstanceId": 100 + index,
                 "windowCount": 1, "mainCount": 1, "mainScene": contract.MAIN_SCENE,
                 "viewport": [1280, 720], "windowMode": 0, "focused": True,
                 "frame": index * 1000}
        end = {**start, "frame": index * 1000 + 800, "exitCode": 0,
               "focusObservedFrames": 800, "unfocusedFrames": 0}
        del end["sample"]
        record.update(schemaVersion=2, argv=contract.command("godot"), batch={
            "strategy": contract.STRATEGY, "plan": plan, "planSha256": plan_sha,
            "start": start, "end": end, "completion": completion,
            "processSettled": True, "windowClosedAfterCleanup": True,
            "cleanupStdout": contract.DRAIN_PREFIX + json.dumps({
                "sampleIndex": index, "snapshot": {"inFlight": 0, "retained": 0}
            }) + "\n" + contract.FINISH_PREFIX + json.dumps(completion) + "\n",
        })
        record["stdout"] = contract.START_PREFIX + json.dumps(start) + "\n" + record["stdout"] + contract.END_PREFIX + json.dumps(end) + "\n"
        records.append(record)
    return records


class MapPerformanceBatchTest(unittest.TestCase):
    def test_valid_matrix_keeps_existing_measurement_checks(self):
        records = fixture_records()
        contract.validate_matrix(records)
        self.assertEqual(builder.parse_perf_run(records[0])["measurementFrames"], 480)

    def test_incomplete_window_main_and_plan_bindings_are_rejected(self):
        for mutate in (
            lambda r: r["batch"].update(windowClosedAfterCleanup=False),
            lambda r: r["batch"].update(processSettled=False),
            lambda r: r["batch"]["completion"].update(releasedMainCount=0),
            lambda r: r["batch"]["completion"].update(windowCount=2),
            lambda r: r["batch"]["start"].update(mainCount=2),
            lambda r: r["batch"]["end"].update(rootWindowId=9),
            lambda r: r["batch"]["end"].update(exitCode=1),
            lambda r: r["batch"]["plan"].update(buildIdentity="stale"),
            lambda r: r["batch"]["start"].update(sampleIndex=1),
            lambda r: r["argv"].insert(1, "--headless"),
        ):
            record = deepcopy(fixture_records()[0])
            mutate(record)
            with self.assertRaises(ValueError):
                contract.validate_binding(record)

    def test_matrix_rejects_missing_reordered_reused_or_mixed_samples(self):
        records = fixture_records()
        for damaged in (records[:-1], records[::-1], [records[0]] + records,
                        [records[0], {"schemaVersion": 1}]):
            with self.assertRaises(ValueError):
                contract.validate_matrix(damaged)

    def test_parser_preserves_each_samples_raw_output(self):
        records = fixture_records()
        raw = "".join(record["stdout"] + record["batch"]["cleanupStdout"].splitlines(True)[0]
                      for record in records)
        raw += contract.FINISH_PREFIX + json.dumps(records[0]["batch"]["completion"]) + "\n"
        segments, completion = batch.split_log(raw, records[0]["batch"]["plan"])
        self.assertEqual([s["stdout"] for s in segments], [r["stdout"] for r in records])
        self.assertEqual(completion["completedSamples"], len(records))
        self.assertEqual([s["cleanupStdout"] for s in segments],
                         [r["batch"]["cleanupStdout"] for r in records])

    def test_parser_rejects_missing_duplicated_error_and_interleaved_output(self):
        records = fixture_records()
        plan = records[0]["batch"]["plan"]
        raw = "".join(record["stdout"] + record["batch"]["cleanupStdout"].splitlines(True)[0]
                      for record in records)
        final = contract.FINISH_PREFIX + json.dumps(records[0]["batch"]["completion"]) + "\n"
        for damaged in (raw, raw + final + final, raw + final + "ERROR: leaked object\n",
                        raw.replace(contract.END_PREFIX, "lost: ", 1) + final,
                        raw.replace(contract.DRAIN_PREFIX, "lost: ", 1) + final,
                        records[0]["stdout"] + raw + final):
            with self.assertRaises(builder.EvidenceError):
                batch.split_log(damaged, plan)

    def test_foreground_must_cover_the_entire_sample(self):
        for change in ({"focused": False}, {"focusObservedFrames": 659},
                       {"unfocusedFrames": 1}, {"unfocusedFrames": False}):
            record = fixture_records()[0]
            record["batch"]["end"].update(change)
            lines = record["stdout"].splitlines(True)
            record["stdout"] = "".join(
                contract.END_PREFIX + json.dumps(record["batch"]["end"]) + "\n"
                if line.startswith(contract.END_PREFIX) else line for line in lines)
            with self.assertRaises(ValueError):
                contract.validate_binding(record)

    def test_raw_cleanup_requires_empty_prefetch_and_matching_completion(self):
        for old, new in (('"inFlight": 0', '"inFlight": 1'),
                         ('"retained": 0', '"retained": 2'),
                         ('"remainingMainCount": 0', '"remainingMainCount": 1')):
            record = fixture_records()[0]
            record["batch"]["cleanupStdout"] = record["batch"]["cleanupStdout"].replace(old, new)
            with self.assertRaises(ValueError):
                contract.validate_binding(record)

    def test_batch_does_not_relax_fixed_frame_warmup_or_audio_checks(self):
        record = fixture_records()[0]
        for old, new in (("frames=60", "frames=59"),
                         ('"frames":180', '"frames":179'),
                         ('"audioStopped":true', '"audioStopped":false')):
            changed = deepcopy(record)
            self.assertIn(old, changed["stdout"])
            changed["stdout"] = changed["stdout"].replace(old, new)
            with self.assertRaises(builder.EvidenceError):
                builder.parse_perf_run(changed)


if __name__ == "__main__":
    unittest.main()
