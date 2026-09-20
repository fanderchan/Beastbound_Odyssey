from pathlib import Path
import json
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import guardian_review_media as media


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "requires FFmpeg tools")
class GuardianMediaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        scratch = media.core.REPO_ROOT / ".run"
        scratch.mkdir(exist_ok=True)
        cls.workspace = tempfile.TemporaryDirectory(prefix="guardian-media-test-", dir=scratch)
        cls.addClassCleanup(cls.workspace.cleanup)
        cls.root = Path(cls.workspace.name)
        cls.source = cls.root / "source.avi"
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i",
            "testsrc2=size=1280x720:rate=30", "-f", "lavfi", "-i", "sine=sample_rate=48000",
            "-t", "1", "-c:v", "mjpeg", "-q:v", "4", "-c:a", "pcm_s16le",
            str(cls.source)], check=True, capture_output=True, timeout=30)

    def directory(self):
        temporary = tempfile.TemporaryDirectory(dir=self.root)
        self.addCleanup(temporary.cleanup)
        return Path(temporary.name)

    def test_valid_recording_keeps_all_frames_and_publishes_only_verified_video(self):
        run = self.directory()
        report = media.encode_review_movie(self.source, run, timeout_seconds=30)
        self.assertEqual(report["status"], "passed")
        self.assertEqual(report["rawFrameCount"], 30)
        self.assertEqual(report["media"]["frameCount"], 30)
        self.assertEqual(report["media"]["fps"], 30)
        self.assertFalse(report["performanceEvidence"])
        self.assertTrue((run / "guardian-1x.mp4").is_file())
        self.assertFalse((run / "guardian-1x.partial.mp4").exists())
        with self.assertRaises(FileExistsError):
            media.encode_review_movie(self.source, run, timeout_seconds=30)
        self.assertEqual(json.loads((run / "media-validation.json").read_text())["status"], "passed")

    def test_corrupt_mjpeg_reproduces_old_false_success_and_now_fails(self):
        run = self.directory()
        damaged = run / "damaged.avi"
        data = bytearray(self.source.read_bytes())
        # Corrupt a real JPEG quantization table inside the second video packet.
        packets = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_packets", "-show_entries", "packet=pos,size", "-of", "json", str(self.source)], text=True))
        packet = packets["packets"][1]
        start = int(packet["pos"])
        table = data.index(b"\xff\xdb", start, start + int(packet["size"]))
        data[table + 4] = 0xff
        damaged.write_bytes(data)
        old = subprocess.run(["ffmpeg", "-v", "error", "-i", str(damaged), "-c:v", "libx264",
            "-pix_fmt", "yuv420p", "-c:a", "aac", str(run / "old-false-success.mp4")],
            capture_output=True, text=True, timeout=30)
        self.assertEqual(old.returncode, 0, old.stderr)
        self.assertIn("invalid", old.stderr.lower())
        with self.assertRaises(media.core.PetManagementRecordingError):
            media.encode_review_movie(damaged, run, timeout_seconds=30)
        report = json.loads((run / "media-validation.json").read_text())
        self.assertEqual((report["status"], report["stage"]), ("failed", "transcode"))
        self.assertFalse((run / "guardian-1x.mp4").exists())
        self.assertIn("invalid", (run / "ffmpeg-transcode.log").read_text().lower())
        self.assertEqual(damaged.read_bytes(), data)

    def test_oversized_godot_avi_is_rejected_before_salvage(self):
        run = self.directory()
        source = run / "oversized.avi"
        with source.open("wb") as stream:
            stream.write(b"RIFF" + struct.pack("<I", 64) + b"AVI ")
            stream.truncate(2**32 + 72)  # Sparse, not a 4 GiB allocation.
        with self.assertRaisesRegex(ValueError, "4 GiB"):
            media.encode_review_movie(source, run, timeout_seconds=30)
        report = json.loads((run / "media-validation.json").read_text())
        self.assertEqual(report["stage"], "source")
        self.assertFalse((run / "ffmpeg-transcode.log").exists())
        self.assertFalse((run / "guardian-1x.mp4").exists())

    def test_zero_exit_with_error_diagnostics_is_rejected(self):
        log = self.directory() / "ffmpeg.log"
        def fake_success(*args, **kwargs):
            log.write_text("$ ffmpeg ...\nPacket corrupt\n")
        with mock.patch.object(media.core, "_run_logged", side_effect=fake_success):
            with self.assertRaisesRegex(ValueError, "error diagnostics"):
                media._strict_ffmpeg([], log, 30)

    def test_frame_loss_is_rejected_even_when_output_decodes(self):
        run = self.directory()
        original = media.core._write_probe
        def changed_probe(ffprobe, path, output):
            probe = original(ffprobe, path, output)
            if path == self.source:
                next(s for s in probe["streams"] if s["codec_type"] == "video")["nb_read_frames"] = "31"
            return probe
        with mock.patch.object(media.core, "_write_probe", side_effect=changed_probe):
            with self.assertRaisesRegex(ValueError, "frame count changed"):
                media.encode_review_movie(self.source, run, timeout_seconds=30)
        self.assertEqual(json.loads((run / "media-validation.json").read_text())["stage"], "frame_contract")
        self.assertFalse((run / "guardian-1x.mp4").exists())

    def test_theora_expands_explicit_duplicates_and_rejects_missing_packets(self):
        run = self.directory()
        source = {"streams": [{"codec_name": "theora", "time_base": "1/30"}],
            "packets": [{"pts": 0, "size": "123"}, {"pts": 1, "size": "0"},
                        {"pts": 2, "size": "15"}, {"pts": 3, "size": "0"}]}
        def inspect(value):
            result = SimpleNamespace(returncode=0, stdout=json.dumps(value), stderr="")
            with mock.patch.object(media.core, "_run_capture", return_value=result):
                return media._theora_timeline(run / "source.ogv", run, 30)
        timeline = inspect(source)
        self.assertEqual((timeline["frameCount"], timeline["duplicateFrames"],
            timeline["trailingDuplicateFrames"]), (4, 2, 1))
        for packets in [[], source["packets"][1:], source["packets"][:1] + source["packets"][2:],
                [source["packets"][0], source["packets"][0]]]:
            with self.subTest(packets=packets), self.assertRaisesRegex(ValueError, "every 30 FPS"):
                inspect({**source, "packets": packets})


if __name__ == "__main__":
    unittest.main()
