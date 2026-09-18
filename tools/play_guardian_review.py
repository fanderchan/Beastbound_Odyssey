#!/usr/bin/env python3
"""Launch one real Main client and four HTTP-driven teammates in disposable memory.

Close the game window, or create <output>/stop, to finish. --record captures the
same interactive run at 30 FPS and converts it without changing playback speed.
No external backend, MySQL, real account, or arbitrary Godot flags are accepted.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
from datetime import datetime, timezone

import record_pet_management_owner_review as core

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--godot", default="godot")
    parser.add_argument("--record", action="store_true")
    parser.add_argument("--autoplay", action="store_true", help="run disclosed in-engine input checks; not Computer Use acceptance")
    parser.add_argument("--timeout-seconds", type=int, default=900)
    args = parser.parse_args()
    if not 30 <= args.timeout_seconds <= 3600:
        parser.error("timeout must be between 30 and 3600 seconds")
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
        backend = subprocess.Popen(["node", str(ROOT / "tools/guardian_review_backend.cjs"),
            str(run / "backend")], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
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
                command += ["--write-movie", str(run / "guardian.avi"), "--fixed-fps", "30", "--max-fps", "30", "--disable-vsync"]
            command += ["--", "--qa-viewport=1280x720", "--map-art-review-preview",
                "--earth-guardian-review", "--auth-server-url=" + fixture["baseUrl"], core.QA_LANE_ARGUMENT]

            def validate(log_path: Path) -> dict:
                text = log_path.read_text()
                if "GUARDIAN_REVIEW_COMPLETED" not in text or any(value in text for value in
                        ("SCRIPT ERROR:", "ERROR:", "leaked at exit", "resources still in use at exit")):
                    raise RuntimeError(f"Main review or cleanup failed; inspect {log_path}")
                if args.autoplay:
                    report = json.loads((run / "autoplay.json").read_text())
                    if report.get("status") != "passed":
                        raise RuntimeError(f"Automated playthrough failed: {report.get('errors')}")
                return {"status": "passed", "scope": "interactive Main review; subjective owner acceptance pending"}

            print(f"GUARDIAN_REVIEW_OUTPUT {run}", flush=True)
            result = core._run_official_lane_godot_sequence(run_dir=run, godot=godot,
                base_environment=environment, native_command=command, native_log=run / "client.log",
                timeout_seconds=args.timeout_seconds, native_log_validator=validate)
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
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(run / "guardian.avi"),
            "-c:v", "libx264", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            "-c:a", "aac", str(run / "guardian-1x.mp4")], check=True)
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(run / "guardian-1x.mp4"), "-f", "null", "-"], check=True)
        probe = subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json",
            str(run / "guardian-1x.mp4")], text=True)
        (run / "media-probe.json").write_text(probe)
    print(f"GUARDIAN_REVIEW_CLEAN {run}", flush=True)


if __name__ == "__main__":
    main()
