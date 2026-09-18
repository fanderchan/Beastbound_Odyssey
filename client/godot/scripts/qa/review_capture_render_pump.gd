extends RefCounted

## Offline review capture only: keep the real viewport current while the OS
## occludes its window. This is never a foreground/performance measurement.
## Godot 4.7 can keep MovieWriter running without drawing an occluded window.

var _window: Window
var _start_frame := 0
var _last_draw_frame := -1
var _last_verified_frame := -1
var _fallback_draw_count := 0
var _missing_draw_count := 0
var _first_missing_frames: Array[int] = []


func start(window: Window) -> void:
	_window = window
	_start_frame = Engine.get_process_frames()
	_last_verified_frame = _start_frame - 1
	_window.get_tree().process_frame.connect(_queue_draw)
	RenderingServer.frame_post_draw.connect(_record_draw)
	_queue_draw()


func stop() -> Dictionary:
	var end_frame := Engine.get_process_frames()
	_verify_previous_frame(end_frame - 1)
	_window.get_tree().process_frame.disconnect(_queue_draw)
	RenderingServer.frame_post_draw.disconnect(_record_draw)
	_window = null
	return {
		"policy": "occluded_viewport_without_present_v1",
		"result": "PASS" if _missing_draw_count == 0 else "FAIL",
		"performanceEvidence": false,
		"startProcessFrame": _start_frame,
		"endProcessFrameExclusive": end_frame,
		"completedProcessFrameCount": end_frame - _start_frame,
		"fallbackDrawCount": _fallback_draw_count,
		"missingDrawFrameCount": _missing_draw_count,
		"firstMissingDrawFrames": _first_missing_frames.duplicate(),
	}


func _queue_draw() -> void:
	_verify_previous_frame(Engine.get_process_frames() - 1)
	# This signal precedes node _process callbacks. Their queue_redraw calls
	# may be enqueued after this first deferral, so draw from a second deferral
	# after those canvas updates, not from an image one process frame behind.
	call_deferred("_schedule_draw")


func _schedule_draw() -> void:
	call_deferred("_draw_if_occluded")


func _draw_if_occluded() -> void:
	# An ordinary drawable window uses its normal render loop. Never focus,
	# raise, or repeatedly restore the native window.
	if _window == null or _window.can_draw():
		return
	RenderingServer.force_draw(false, _window.get_process_delta_time())
	_fallback_draw_count += 1


func _record_draw() -> void:
	_last_draw_frame = Engine.get_process_frames()


func _verify_previous_frame(frame: int) -> void:
	if frame < _start_frame or frame <= _last_verified_frame:
		return
	if _last_draw_frame < frame:
		_missing_draw_count += 1
		if _first_missing_frames.size() < 16:
			_first_missing_frames.append(frame)
	_last_verified_frame = frame
