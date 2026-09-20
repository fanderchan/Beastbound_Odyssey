from pathlib import Path
import json
import sys
import tempfile
import threading
import unittest
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import play_guardian_review as review


class GuardianBackendWatchTests(unittest.TestCase):
    def test_completed_battle_requires_every_turn_to_finish_once_in_order(self):
        turns = [{"roomId": "room", "round": number, "turnSeq": number} for number in range(1, 5)]
        events = [{"event": {"type": "battle.turn_resolved", "turn": turn}} for turn in turns]
        events.append({"event": {"type": "battle.room_closed", "room": {"roomId": "room"}}})
        records = [{**turn, "stage": stage, "frame": index, "skippedTurns": 0}
            for index, (turn, stage) in enumerate((turn, stage) for turn in turns for stage in ("started", "finished"))]
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)
            (run / "backend").mkdir()
            (run / "backend/battle-events.ndjson").write_text("\n".join(map(json.dumps, events)))
            path = run / "turn-playback.ndjson"
            with self.assertRaises(RuntimeError):
                review.validate_turn_playback(run)
            path.write_text("\n".join(map(json.dumps, records)))
            self.assertEqual(review.validate_turn_playback(run)["turns"], 4)
            for invalid in [records[:2], records[:-1], records + records[-2:],
                    records[:2] + records[4:6] + records[2:4] + records[6:],
                    [{**row, "skippedTurns": 1} for row in records],
                    records[:-1] + [{**records[-1], "frame": 0}]]:
                with self.subTest(invalid=invalid):
                    path.write_text("\n".join(map(json.dumps, invalid)))
                    with self.assertRaises(RuntimeError):
                        review.validate_turn_playback(run)
            (run / "backend/battle-events.ndjson").write_text("")
            self.assertEqual(review.validate_turn_playback(run)["status"], "not_observed")

    def test_arena_sampling_rejects_lost_final_round_context_and_unloaded_texture(self):
        battle = {"battle": True, "frame": 13153, "serverRoomStatus": "closed",
            "arenaEvidence": {"id": "earth_vein_sanctum"}, "arenaTextureReady": True}
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)
            def write(states):
                (run / "states.ndjson").write_text("\n".join(json.dumps(state) for state in states))
            write([{"battle": False}, battle])
            result = review._validate_arena_samples(run)
            self.assertEqual(result["status"], "passed")
            self.assertEqual(result["battleSamples"], 1)
            self.assertEqual(result["closedRoomPlaybackSamples"], 1)
            for invalid in [{"arenaEvidence": {}}, {"arenaEvidence": None},
                    {"arenaEvidence": {"id": "moss_meadow"}}, {"arenaTextureReady": False}]:
                with self.subTest(invalid=invalid):
                    write([battle, {**battle, **invalid}])
                    with self.assertRaisesRegex(RuntimeError, "13153"):
                        review._validate_arena_samples(run)
            write([{"battle": False}])
            self.assertEqual(review._validate_arena_samples(run)["status"], "not_observed")
            write([])
            with self.assertRaisesRegex(RuntimeError, "no observed states"):
                review._validate_arena_samples(run)

    def test_autoplay_rejects_silent_reconnects_despite_successful_battle(self):
        ready = {"state": "open", "phase": "ready", "attempt": 0}
        metric = {"acceptedUpgrades": 1, "rejectedUpgrades": 0, "heartbeatTimeouts": 0,
            "protocolViolations": 0, "inboundRateLimited": 0, "slowConsumerDisconnects": 0}
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)
            (run / "backend").mkdir()
            def write(states, metrics):
                (run / "states.ndjson").write_text("\n".join(json.dumps({"eventStream": s}) for s in states))
                (run / "backend/event-stream.ndjson").write_text("\n".join(json.dumps(m) for m in metrics))
            write([{"state": "connecting", "phase": "connecting", "attempt": 0}, ready, ready], [metric])
            self.assertEqual(review._validate_event_stream(run)["readySamples"], 2)
            for states, metrics in [([], [metric]), ([ready], []),
                    ([ready, {"state": "closed", "phase": "idle", "attempt": 1}, ready], [metric]),
                    ([ready], [{**metric, "acceptedUpgrades": 2}]),
                    ([ready], [{**metric, "rejectedUpgrades": 1}]),
                    ([ready], [{**metric, "heartbeatTimeouts": 1}])]:
                with self.subTest(states=states, metrics=metrics):
                    write(states, metrics)
                    with self.assertRaises(RuntimeError):
                        review._validate_event_stream(run)

    def test_capture_requires_complete_draw_receipt_and_never_claims_performance(self):
        receipt = {"captureFrameStartInclusive": 12, "processFrameEndExclusive": 112,
            "renderContinuity": {"policy": "occluded_viewport_without_present_v1", "result": "PASS",
                "performanceEvidence": False, "startProcessFrame": 12, "endProcessFrameExclusive": 112,
                "completedProcessFrameCount": 100, "fallbackDrawCount": 99,
                "missingDrawFrameCount": 0, "firstMissingDrawFrames": []}}
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)
            with self.assertRaises(FileNotFoundError):
                review._validate_capture(run)
            path = run / "render-continuity.json"
            path.write_text(json.dumps(receipt))
            self.assertFalse(review._validate_capture(run)["performanceEvidence"])
            invalid = [None, [], {}, {**receipt, "processFrameEndExclusive": 111}]
            for fields in [{"missingDrawFrameCount": 1, "firstMissingDrawFrames": [54]},
                           {"result": "FAIL"}, {"performanceEvidence": True}]:
                invalid.append({**receipt, "renderContinuity": {**receipt["renderContinuity"], **fields}})
            for value in invalid:
                with self.subTest(value=value):
                    path.write_text(json.dumps(value))
                    with self.assertRaises(ValueError):
                        review._validate_capture(run)

    def test_mac_sleep_assertion_is_owned_and_released_after_failure(self):
        with mock.patch.object(review.sys, "platform", "darwin"), mock.patch.object(review.subprocess, "Popen") as launch:
            guard = launch.return_value
            guard.poll.return_value = None
            with self.assertRaisesRegex(RuntimeError, "failed review"):
                with review._keep_review_awake():
                    raise RuntimeError("failed review")
            self.assertEqual(launch.call_args.args[0],
                ["/usr/bin/caffeinate", "-is", "-w", str(review.os.getpid())])
            guard.terminate.assert_called_once()
            guard.wait.assert_called_once_with(timeout=5)

    def test_unexpected_backend_exit_stops_the_owned_client(self):
        for code in (0, 7):
            with self.subTest(code=code), tempfile.TemporaryDirectory() as directory:
                run = Path(directory)
                backend = SimpleNamespace(pid=4321, poll=mock.Mock(side_effect=[None, code]))
                review._watch_backend(backend, run, threading.Event())
                self.assertTrue((run / "stop").is_file())
                report = json.loads((run / "backend-failure.json").read_text())
                self.assertEqual(report["exitCode"], code)
                self.assertEqual(report["pid"], backend.pid)
                self.assertEqual(report["reason"], "backend_exited_during_client_review")

    def test_live_backend_and_normal_completion_do_not_request_stop(self):
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)
            observed = threading.Event()
            finished = threading.Event()

            def poll():
                observed.set()
                return None

            worker = threading.Thread(target=review._watch_backend,
                args=(SimpleNamespace(pid=4321, poll=poll), run, finished))
            worker.start()
            self.assertTrue(observed.wait(2))
            finished.set()
            worker.join(2)
            self.assertFalse(worker.is_alive())
            self.assertEqual(list(run.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
