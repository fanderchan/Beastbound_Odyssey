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
