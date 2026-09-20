extends RefCounted

## Manual MovieWriter review only. Fixed-FPS simulation bypasses the engine's
## normal frame limiter; keep it from running ahead of the operator/server.
## Never use this helper to collect game performance measurements.
const CAPTURE_FPS := 30
const INTERVAL_USEC := 33334

var _tree: SceneTree
var _started_usec := 0
var _last_frame_usec := 0
var _frames := 0
var _minimum_interval_usec := 0
var _maximum_interval_usec := 0
var _sleep_usec := 0


func start(tree: SceneTree) -> void:
	assert(_tree == null and _frames == 0)
	_tree = tree
	_started_usec = Time.get_ticks_usec()
	_last_frame_usec = _started_usec
	_tree.process_frame.connect(_pace)


func _pace() -> void:
	var now := Time.get_ticks_usec()
	var deadline := _last_frame_usec + INTERVAL_USEC
	while now < deadline:
		var before_sleep := now
		OS.delay_usec(deadline - now)
		now = Time.get_ticks_usec()
		_sleep_usec += now - before_sleep
	var interval := now - _last_frame_usec
	_minimum_interval_usec = interval if _frames == 0 else mini(_minimum_interval_usec, interval)
	_maximum_interval_usec = maxi(_maximum_interval_usec, interval)
	_frames += 1
	# Schedule from the actual frame, not the old deadline: a slow frame must
	# never create a burst of catch-up frames when rendering becomes available.
	_last_frame_usec = now


func stop() -> Dictionary:
	assert(_tree != null)
	_tree.process_frame.disconnect(_pace)
	_tree = null
	return {
		"policy": "manual_recording_no_catch_up_v1",
		"performanceEvidence": false,
		"captureFps": CAPTURE_FPS,
		"intervalUsec": INTERVAL_USEC,
		"pacedFrames": _frames,
		"wallUsec": Time.get_ticks_usec() - _started_usec,
		"minimumFrameIntervalUsec": _minimum_interval_usec,
		"maximumFrameIntervalUsec": _maximum_interval_usec,
		"sleepUsec": _sleep_usec,
	}
