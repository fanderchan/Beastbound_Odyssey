#!/usr/bin/env python3
"""Launch one real Main client and four HTTP-driven teammates in disposable memory.

Close the game window, or create <output>/stop, to finish. --record captures the
same interactive run at 30 FPS and converts it without changing playback speed.
No external backend, MySQL, real account, or arbitrary Godot flags are accepted.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone

import record_pet_management_owner_review as core
from guardian_review_media import encode_review_movie
from review_capture_render_continuity import validate_render_continuity

ROOT = Path(__file__).resolve().parents[1]


def _validate_capture(run: Path) -> dict:
    report = json.loads((run / "render-continuity.json").read_text())
    if not isinstance(report, dict):
        raise ValueError("Guardian render continuity must be an object")
    return validate_render_continuity(report)


def _validate_event_stream(run: Path) -> dict:
    states = [json.loads(line)["eventStream"] for line in (run / "states.ndjson").read_text().splitlines()]
    metrics = [json.loads(line) for line in (run / "backend/event-stream.ndjson").read_text().splitlines()]
    ready_index = next((index for index, state in enumerate(states) if state.get("phase") == "ready"), None)
    if (ready_index is None or not metrics
            or any(state.get("attempt") != 0 for state in states)
            or any(state.get("state") != "open" or state.get("phase") != "ready" for state in states[ready_index:])
            or max(row.get("acceptedUpgrades", 0) for row in metrics) != 1
            or any(row.get("rejectedUpgrades") != 0 or row.get("heartbeatTimeouts") != 0
                or row.get("protocolViolations") != 0 or row.get("inboundRateLimited") != 0
                or row.get("slowConsumerDisconnects") != 0 for row in metrics)):
        raise RuntimeError("Guardian event stream did not remain ready on one healthy connection")
    return {"status": "passed", "readySamples": len(states) - ready_index, "acceptedUpgrades": 1,
        "scope": "isolated autoplay without deliberate network interruption"}


@contextmanager
def _keep_review_awake():
    # A locked Mac may enter deep idle during a recording. Scope the assertion
    # to this process; never wake the display, unlock it or change power settings.
    if sys.platform != "darwin":
        yield
        return
    guard = subprocess.Popen(["/usr/bin/caffeinate", "-is", "-w", str(os.getpid())],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        yield
    finally:
        if guard.poll() is None:
            guard.terminate()
        guard.wait(timeout=5)


def _watch_backend(backend, run: Path, finished: threading.Event) -> None:
    """Stop the owned client promptly if its required backend terminates."""
    while not finished.wait(0.1):
        exit_code = backend.poll()
        if exit_code is None:
            continue
        (run / "backend-failure.json").write_text(json.dumps({
            "status": "failed", "reason": "backend_exited_during_client_review",
            "pid": backend.pid, "exitCode": exit_code,
        }, indent=2))
        (run / "stop").touch()
        return


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--godot", default="godot")
    parser.add_argument("--record", action="store_true")
    parser.add_argument("--autoplay", action="store_true", help="run disclosed in-engine input checks; not Computer Use acceptance")
    parser.add_argument("--cave-journey", action="store_true", help="also preview existing candidate art in ordinary cave encounters; continue playing after the guardian")
    parser.add_argument("--downed-owner-check", action="store_true", help="use a fixed encounter seed, leader at 1/10400 HP and leader pet at 1 HP; healthy teammates keep fighting")
    parser.add_argument("--timeout-seconds", type=int, default=900)
    args = parser.parse_args()
    if not 30 <= args.timeout_seconds <= 3600:
        parser.error("timeout must be between 30 and 3600 seconds")
    if args.cave_journey and args.autoplay:
        parser.error("--cave-journey is interactive; --autoplay stops after the guardian")
    if args.downed_owner_check and (args.cave_journey or args.autoplay):
        parser.error("--downed-owner-check is a separate interactive regression fixture")
    godot = shutil.which(args.godot)
    if not godot:
        parser.error("Godot executable not found")
    if args.record and not all(shutil.which(name) for name in ("ffmpeg", "ffprobe")):
        parser.error("--record requires ffmpeg and ffprobe")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    run = ROOT / ".run" / "guardian-review" / stamp
    run.mkdir(parents=True, mode=0o700)
    environment = dict(os.environ, BEASTBOUND_GUARDIAN_REVIEW_DIR=str(run),
        BEASTBOUND_GUARDIAN_ONLINE_FIXTURE=str(run / "backend/fixture.json"),
        BEASTBOUND_GUARDIAN_AUTOPLAY="1" if args.autoplay else "0",
        BEASTBOUND_GUARDIAN_REVIEW_SECONDS=str(args.timeout_seconds - 15))
    with (run / "backend.log").open("w") as log:
        backend_command = ["node", str(ROOT / "tools/guardian_review_backend.cjs"), str(run / "backend")]
        if args.downed_owner_check:
            backend_command.append("--downed-owner-check")
        backend = subprocess.Popen(backend_command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL, start_new_session=True)
        try:
            deadline = time.monotonic() + 30
            fixture_path = run / "backend/fixture.json"
            while not fixture_path.exists():
                if backend.poll() is not None or time.monotonic() > deadline:
                    raise RuntimeError(f"QA backend failed to start; inspect {run / 'backend.log'}")
                time.sleep(0.1)
            fixture = json.loads(fixture_path.read_text())
            command = [godot, "--path", str(ROOT / "client/godot"), "--script",
                "res://scripts/qa/guardian_battle_review.gd", "--windowed", "--resolution", "1280x720",
                "--single-window", "--audio-driver", "Dummy"]
            if args.record:
                # OGV avoids Godot's 4 GiB AVI limit during longer interactive runs.
                command += ["--write-movie", str(run / "guardian.ogv"), "--fixed-fps", "30", "--max-fps", "30", "--disable-vsync"]
            command += ["--", "--qa-viewport=1280x720", "--map-art-review-preview",
                "--earth-guardian-review", "--auth-server-url=" + fixture["baseUrl"], core.QA_LANE_ARGUMENT]
            if args.cave_journey:
                command.append("--earth-cave-review")

            def validate(log_path: Path) -> dict:
                if (run / "backend-failure.json").exists() or backend.poll() is not None:
                    raise RuntimeError(f"QA teammate backend exited during review; inspect {run / 'backend.log'}")
                text = log_path.read_text()
                if "GUARDIAN_REVIEW_COMPLETED" not in text or any(value in text for value in
                        ("SCRIPT ERROR:", "ERROR:", "leaked at exit", "resources still in use at exit")):
                    raise RuntimeError(f"Main review or cleanup failed; inspect {log_path}")
                continuity = _validate_capture(run)
                if args.autoplay:
                    report = json.loads((run / "autoplay.json").read_text())
                    if report.get("status") != "passed":
                        raise RuntimeError(f"Automated playthrough failed: {report.get('errors')}")
                    _validate_event_stream(run)
                return {"status": "passed", "scope": "Main review capture; subjective owner acceptance pending",
                    "performanceEvidence": False, "renderContinuity": continuity}

            print(f"GUARDIAN_REVIEW_OUTPUT {run}", flush=True)
            finished = threading.Event()
            watcher = threading.Thread(target=_watch_backend, args=(backend, run, finished), daemon=True)
            watcher.start()
            try:
                result = core._run_official_lane_godot_sequence(run_dir=run, godot=godot,
                    base_environment=environment, native_command=command, native_log=run / "client.log",
                    timeout_seconds=args.timeout_seconds, native_log_validator=validate)
            finally:
                finished.set()
                watcher.join(timeout=2)
            (run / "lifecycle-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str))
        finally:
            if backend.poll() is None:
                (run / "backend/stop-server").touch()
                try:
                    backend.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    backend.terminate()
                    try:
                        backend.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        backend.kill()
                        backend.wait(timeout=5)
        if backend.returncode:
            raise RuntimeError(f"QA backend failed; inspect {run / 'backend.log'}")
        if not (run / "backend/stopped.json").is_file():
            raise RuntimeError(f"QA backend did not complete its shutdown receipt; inspect {run / 'backend.log'}")
    if args.record:
        encode_review_movie(run / "guardian.ogv", run, timeout_seconds=args.timeout_seconds)
    print(f"GUARDIAN_REVIEW_CLEAN {run}", flush=True)


if __name__ == "__main__":
    with _keep_review_awake():
        main()
