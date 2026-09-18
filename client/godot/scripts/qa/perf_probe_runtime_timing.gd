extends RefCounted


static func report(
	samples: Array[Dictionary],
	start_usec: int,
	end_usec: int,
	configured_max_fps_at_start: int,
	configured_max_fps_at_end: int
) -> Dictionary:
	var result := {
		"schemaVersion": 1,
		"scope": "sampled_process_frames",
		"status": "failed",
	}
	if start_usec <= 0 or end_usec <= start_usec or samples.is_empty():
		result["reason"] = "missing_or_invalid_measurement_window"
		return result
	var frames := 0
	var simulation_seconds := 0.0
	for sample in samples:
		var sample_frames: Variant = sample.get("frames")
		var sample_elapsed: Variant = sample.get("elapsed")
		if (
			not sample_frames is int or int(sample_frames) <= 0
			or not (sample_elapsed is float or sample_elapsed is int)
			or not is_finite(float(sample_elapsed)) or float(sample_elapsed) <= 0.0
		):
			result["reason"] = "invalid_sample"
			return result
		frames += int(sample_frames)
		simulation_seconds += float(sample_elapsed)
	var wall_seconds := float(end_usec - start_usec) / 1000000.0
	result.merge({
		"status": "passed",
		"frames": frames,
		"wallElapsedSeconds": wall_seconds,
		"simulationElapsedSeconds": simulation_seconds,
		"wallProcessFramesPerSecond": float(frames) / wall_seconds,
		"simulationProcessFramesPerSecond": float(frames) / simulation_seconds,
		# Configuration is not proof that the engine honors this cap: --fixed-fps
		# bypasses its normal wait. Raw engine argv belongs to the external runner.
		"configuredMaxFpsAtStart": configured_max_fps_at_start,
		"configuredMaxFpsAtEnd": configured_max_fps_at_end,
	}, true)
	return result
