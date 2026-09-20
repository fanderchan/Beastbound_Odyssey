"""Strict media delivery for the disposable guardian review, never asset approval."""
from __future__ import annotations

import json
from pathlib import Path

import record_pet_management_owner_review as core


def encode_review_movie(raw_movie: Path, run: Path, *, timeout_seconds: float) -> dict:
    """Publish the MP4 name only after error-free conversion and equal frame timelines.

    Godot's legacy AVI writer is limited to 4 GiB. New guardian reviews use OGV;
    reject oversized old AVI captures without allowing FFmpeg to salvage them.
    """
    video = run / "guardian-1x.mp4"
    temporary_video = run / "guardian-1x.partial.mp4"
    receipt_path = run / "media-validation.json"
    if any(path.exists() for path in (video, temporary_video, receipt_path)):
        raise FileExistsError("Guardian media delivery requires fresh output paths")
    receipt = {"status": "failed", "rawMovie": str(raw_movie), "stage": "source",
        "performanceEvidence": False, "ownerAcceptance": "pending"}
    try:
        if raw_movie.suffix.lower() == ".avi" and raw_movie.stat().st_size >= 2**32:
            raise ValueError("Godot AVI capture exceeds its 4 GiB limit; record again as OGV")
        timeline = _theora_timeline(raw_movie, run, timeout_seconds) if raw_movie.suffix.lower() == ".ogv" else None
        filters = "scale=in_range=auto:out_range=tv,format=yuv420p"
        if timeline:
            # Empty Theora packets mean repeat the previous image. FFmpeg's
            # decoder omits them, including trailing holds: expand only these
            # verified packet timestamps, never an inferred missing capture.
            # FFmpeg can infer a full keyframe interval at EOF when the last
            # coded image is a keyframe. Bound expansion by the verified packet
            # count, so that inferred duration cannot extend the recording.
            filters += (f",fps=30,tpad=stop_mode=clone:stop={timeline['trailingDuplicateFrames']}"
                f",trim=end_frame={timeline['frameCount']}")
        receipt["stage"] = "transcode"
        _strict_ffmpeg(["-i", str(raw_movie), "-map", "0:v:0", "-map", "0:a:0",
            "-vf", filters, "-color_range", "tv",
            "-c:v", "libx264", "-crf", "19", "-pix_fmt", "yuv420p",
            "-fps_mode", "passthrough", "-movflags", "+faststart", "-c:a", "aac",
            str(temporary_video)], run / "ffmpeg-transcode.log", timeout_seconds)
        receipt["stage"] = "full_decode"
        _strict_ffmpeg(["-i", str(temporary_video), "-map", "0:v:0", "-map", "0:a:0",
            "-f", "null", "-"], run / "full-audio-video-decode.log", timeout_seconds)
        receipt["stage"] = "frame_contract"
        source = core._write_probe("ffprobe", raw_movie, run / "source-media-probe.json")
        probe = core._write_probe("ffprobe", temporary_video, run / "media-probe.json")
        media = core._validate_probe(probe)
        raw_video = next(stream for stream in source["streams"] if stream.get("codec_type") == "video")
        raw_frames = int(raw_video["nb_read_frames"])
        if timeline:
            if raw_frames != timeline["frameCount"] - timeline["duplicateFrames"]:
                raise ValueError("Theora decoded frames do not match its coded packets")
            raw_frames = timeline["frameCount"]
            receipt["sourceTimeline"] = timeline
        if raw_frames <= 0 or media["frameCount"] != raw_frames:
            raise ValueError(f"Guardian movie frame count changed: {raw_frames} -> {media['frameCount']}")
        source_record = core._artifact_record(raw_movie)
        video_record = core._artifact_record(temporary_video)
        video_record["path"] = core._repo_relative(video)
        temporary_video.rename(video)
        receipt.update(status="passed", stage="complete", rawFrameCount=raw_frames,
            media=media, source=source_record, video=video_record)
    except Exception as error:
        receipt["error"] = str(error)
        raise
    finally:
        receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    return receipt


def _theora_timeline(raw_movie: Path, run: Path, timeout_seconds: float) -> dict:
    completed = core._run_capture(["ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_packets", "-show_entries", "packet=pts,size:stream=codec_name,time_base",
        "-of", "json", str(raw_movie)], timeout_seconds=timeout_seconds)
    (run / "source-packets-probe.log").write_text(completed.stderr)
    if completed.returncode or completed.stderr.strip():
        raise ValueError("Invalid OGV packet stream; inspect source-packets-probe.log")
    source = json.loads(completed.stdout)
    core._write_json(run / "source-packets.json", source)
    streams = source.get("streams", [])
    packets = source.get("packets", [])
    if (len(streams) != 1 or streams[0].get("codec_name") != "theora"
            or streams[0].get("time_base") != "1/30" or not packets
            or int(packets[0].get("size", 0)) <= 0
            or any(packet.get("pts") != index or int(packet.get("size", -1)) < 0
                for index, packet in enumerate(packets))):
        raise ValueError("OGV must contain every 30 FPS Theora packet in order from frame zero")
    trailing = 0
    for packet in reversed(packets):
        if int(packet["size"]) != 0:
            break
        trailing += 1
    return {"frameCount": len(packets), "duplicateFrames": sum(int(p["size"]) == 0 for p in packets),
        "trailingDuplicateFrames": trailing, "fps": 30,
        "policy": "expand_explicit_theora_duplicate_packets"}


def _strict_ffmpeg(arguments: list[str], log: Path, timeout_seconds: float) -> None:
    core._run_logged(["ffmpeg", "-nostdin", "-n", "-v", "error", "-xerror", *arguments],
        log_path=log, timeout_seconds=timeout_seconds)
    # Some demuxer diagnostics can still exit zero. At error log level, any
    # output after the command header must fail rather than silently drop data.
    if "\n".join(log.read_text().splitlines()[1:]).strip():
        raise ValueError(f"Guardian movie has FFmpeg error diagnostics; inspect {log}")
